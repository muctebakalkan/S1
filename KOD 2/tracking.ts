/**
 * Sürüş Asistanı — Arka Plan KM Takip Servisi
 * -------------------------------------------
 * GPS + (Android'de aktivite tanıma) ile araç içi hareketi algılar ve
 * kat edilen mesafeyi pili koruyacak şekilde hesaplar.
 *
 * Tasarım notları:
 *  - expo-location + expo-task-manager DINAMIK yüklenir; modül yoksa uygulama
 *    çökmez, manuel/simüle giriş devreye girer (mevcut ai-analysis kalıbı).
 *  - Arka plan konum güncellemeleri AsyncStorage'daki bir tampona yazılır;
 *    ön plandaki dashboard bu tamponu okuyup mesafeyi Haversine ile hesaplar.
 *  - GPS gürültüsü (maxJumpKm) ve yürüme (minSpeedKmh) filtrelenir.
 */

import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TRACKING } from './config';
import { recordDrive, setTrackingEnabled, RecordDriveResult, RecordDriveInput } from './api';
import { scheduleEndOfDayFuelSummaryForVehicle } from './fuel';

// ── Dinamik modül yükleyiciler ──────────────────────────────
function loadLocation(): any {
  try { return require('expo-location'); } catch { return null; }
}
function loadTaskManager(): any {
  try { return require('expo-task-manager'); } catch { return null; }
}

const BUFFER_KEY = 'drive_buffer_points';
const SESSION_KEY = 'drive_session_meta';

let trackingQueue: Promise<unknown> = Promise.resolve();
function serializeTracking<T>(work: () => Promise<T>): Promise<T> {
  const result = trackingQueue.then(work);
  trackingQueue = result.catch(() => undefined);
  return result;
}

import { computeDistance, BufferPoint } from './distance';
interface SessionMeta {
  userId: string; startedAt: string; vehicleId?: string | null;
  pending?: RecordDriveInput;
}

/** Keep the exact submitted interval until the server acknowledges it. */
async function flushPending(meta: SessionMeta): Promise<RecordDriveResult | null> {
  if (!meta.pending) return null;
  const result = await recordDrive(meta.pending);
  if (!result) throw new Error('Sürüş kaydedilemedi. Veriler telefonda saklandı; bağlantınızı kontrol ederek tekrar deneyin.');
  const cutoff = Date.parse(meta.pending.endedAt!);
  const points: BufferPoint[] = JSON.parse(await AsyncStorage.getItem(BUFFER_KEY) ?? '[]');
  // Timestamp pruning is repeatable even if the app closes between these writes.
  await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(points.filter(point => point.t >= cutoff)));
  const next: SessionMeta = { userId: meta.userId, vehicleId: meta.vehicleId, startedAt: new Date(cutoff).toISOString() };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return result;
}

async function saveBufferedDrive(): Promise<RecordDriveResult | null> {
  let meta: SessionMeta = JSON.parse(await AsyncStorage.getItem(SESSION_KEY) ?? 'null');
  const { data: { session } } = await supabase.auth.getSession();
  if (!meta || !session?.user || meta.userId !== session.user.id) throw new Error('Sürüş kaydı bu oturuma ait değil.');
  let latest = await flushPending(meta);
  // Drain bounded intervals; a long offline trip never becomes a >500 km request.
  for (let batch = 0; batch < 32; batch++) {
    meta = JSON.parse(await AsyncStorage.getItem(SESSION_KEY) ?? 'null');
    const points: BufferPoint[] = JSON.parse(await AsyncStorage.getItem(BUFFER_KEY) ?? '[]');
    if (points.length < 2) return latest;
    const startTime = points[0].t;
    const boundary = startTime + 15 * 60 * 1000;
    let count = points.findIndex((point, index) => index > 0 && point.t > boundary);
    if (count < 0) count = points.length;
    if (count < 2) {
      // A disconnected GPS gap has no measurable segment; retain the next fix.
      await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(points.slice(1)));
      continue;
    }
    const chunk = points.slice(0, count);
    const { distanceKm, start, end } = computeDistance(chunk);
    if (distanceKm < TRACKING.minDriveKm) {
      if (count === points.length) return latest;
      await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(points.slice(count - 1)));
      continue;
    }
    meta.pending = {
      distanceKm: Number(distanceKm.toFixed(2)),
      durationSec: Math.round((chunk[chunk.length - 1].t - startTime) / 1000),
      startPoint: start, endPoint: end, vehicleId: meta.vehicleId ?? null,
      source: 'auto', startedAt: new Date(startTime).toISOString(), endedAt: new Date(chunk[chunk.length - 1].t).toISOString(),
    };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(meta));
    latest = await flushPending(meta);
  }
  throw new Error('Bekleyen sürüşler aktarılıyor. Kalan kayıtlar telefonda saklanıyor; tekrar deneyin.');
}

// ── Arka plan görevi (global scope'ta tanımlanmalı) ─────────
const TaskManager = loadTaskManager();
if (TaskManager) {
  try {
    if (!TaskManager.isTaskDefined?.(TRACKING.taskName)) {
      TaskManager.defineTask(TRACKING.taskName, ({ data, error }: any) => serializeTracking(async () => {
        if (error || !data?.locations?.length) return;
        try {
          const rawSession = await AsyncStorage.getItem(SESSION_KEY);
          const session: SessionMeta | null = rawSession ? JSON.parse(rawSession) : null;
          const { data: { session: authSession } } = await supabase.auth.getSession();
          const user = authSession?.user;
          if (!session || !user || session.userId !== user.id) return;
          const raw = await AsyncStorage.getItem(BUFFER_KEY);
          const buf: BufferPoint[] = raw ? JSON.parse(raw) : [];
          for (const loc of data.locations) {
            if (!Number.isFinite(loc.timestamp) || !Number.isFinite(loc.coords?.latitude) || !Number.isFinite(loc.coords?.longitude)) continue;
            if (buf.length && loc.timestamp <= buf[buf.length - 1].t) continue;
            buf.push({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              t: loc.timestamp ?? Date.now(),
              speed: loc.coords.speed ?? undefined,
              accuracy: loc.coords.accuracy ?? undefined,
            });
          }
          await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(buf));

          // Takip günlerce açık bırakılırsa mesafenin yalnızca kullanıcı düğmeye
          // bastığında kaybolmaması için güvenli aralıklarla parçalı kayıt al.
          const rawMeta = await AsyncStorage.getItem(SESSION_KEY);
          const meta: SessionMeta | null = rawMeta ? JSON.parse(rawMeta) : null;
          const elapsedMs = meta ? Date.now() - new Date(meta.startedAt).getTime() : 0;
          if (meta && (meta.pending || elapsedMs >= 15 * 60 * 1000) && buf.length > 1) {
            const result = await saveBufferedDrive();
            if (result) await scheduleEndOfDayFuelSummaryForVehicle(meta.vehicleId ?? null);
          }
        } catch { /* sonraki güncellemede yeniden dene */ }
      }));
    }
  } catch { /* tanımlama başarısızsa arka plan devre dışı */ }
}

// ── İzinler ─────────────────────────────────────────────────
export interface PermissionState {
  foreground: boolean;
  background: boolean;
  available: boolean; // modüller mevcut mu
}

export async function getPermissionState(): Promise<PermissionState> {
  const Location = loadLocation();
  if (!Location) return { foreground: false, background: false, available: false };
  const fg = await Location.getForegroundPermissionsAsync();
  let bg = { granted: false };
  try { bg = await Location.getBackgroundPermissionsAsync(); } catch { /* iOS eski sürüm */ }
  return { foreground: !!fg.granted, background: !!bg.granted, available: true };
}

/**
 * İzin akışı: Önce ön plan konumu, sonra "Her Zaman" (arka plan) izni istenir.
 * Android 10+ için arka plan izni ayrı bir adımdır; kullanıcı sistem ayarından
 * "Her zaman izin ver" seçmelidir.
 */
export async function requestPermissions(): Promise<PermissionState> {
  const Location = loadLocation();
  if (!Location) return { foreground: false, background: false, available: false };

  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { foreground: false, background: false, available: true };

  let bg = { granted: false };
  try {
    bg = await Location.requestBackgroundPermissionsAsync();
  } catch { /* bazı platformlarda desteklenmez */ }

  return { foreground: true, background: !!bg.granted, available: true };
}

// ── Takibi başlat / durdur ──────────────────────────────────
export async function isTracking(): Promise<boolean> {
  const Location = loadLocation();
  if (!Location) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(TRACKING.taskName);
  } catch {
    return false;
  }
}

async function startTrackingUnlocked(vehicleId?: string | null): Promise<{ ok: boolean; reason?: string }> {
  const Location = loadLocation();
  if (!Location) return { ok: false, reason: 'konum-modulu-yok' };

  const perm = await getPermissionState();
  if (!perm.foreground || !perm.background) return { ok: false, reason: 'Otomatik takip için arka plan konum izni gerekli.' };
  const { data: { session: authSession } } = await supabase.auth.getSession();
  const user = authSession?.user;
  if (!user || !vehicleId) return { ok: false, reason: 'Oturum açın ve kayıtlı bir araç seçin.' };
  if (await isTracking()) {
    const active = await AsyncStorage.getItem(SESSION_KEY);
    const meta: SessionMeta | null = active ? JSON.parse(active) : null;
    if (!meta || meta.userId !== user.id) return { ok: false, reason: 'Etkin sürüş başka bir oturuma ait.' };
    if (meta.vehicleId !== vehicleId) return { ok: false, reason: 'Araç değiştirmeden önce mevcut sürüş takibini durdurun.' };
    return { ok: true };
  }
  const pending = await AsyncStorage.getItem(BUFFER_KEY);
  if (pending && JSON.parse(pending).length > 1) {
    try { await stopTrackingUnlocked(); }
    catch (error: any) { return { ok: false, reason: error?.message ?? 'Bekleyen sürüş kaydedilemedi.' }; }
  }

  // Tamponu temizle, oturumu başlat
  await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify([]));
  const meta: SessionMeta = { userId: user.id, startedAt: new Date().toISOString(), vehicleId: vehicleId ?? null };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(meta));

  try {
    await Location.startLocationUpdatesAsync(TRACKING.taskName, {
      accuracy: Location.Accuracy.High, // 50 m doğruluk filtresi için hassas konum
      activityType: Location.ActivityType.AutomotiveNavigation,
      distanceInterval: TRACKING.distanceIntervalMeters,
      timeInterval: TRACKING.timeIntervalMs,
      deferredUpdatesInterval: TRACKING.deferredUpdatesIntervalMs,
      deferredUpdatesDistance: TRACKING.deferredUpdatesDistanceMeters,
      pausesUpdatesAutomatically: true,            // iOS: durunca otomatik duraklat
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'SanayiX sürüşünüzü takip ediyor',
        notificationBody: 'Kilometre ve tahmini yakıt masrafı hesaplanıyor. Takibi uygulamadan durdurabilirsiniz.',
        notificationColor: '#FF9418',
      },
    });
  } catch (e: any) {
    await AsyncStorage.multiRemove([BUFFER_KEY, SESSION_KEY]);
    return { ok: false, reason: e?.message ?? 'baslatilamadi' };
  }
  // Sunucu göstergesi bağlantı yüzünden güncellenemese de OS takibi aktiftir.
  try { await setTrackingEnabled(true); } catch { /* sonraki başlangıç/duruşta eşitlenir */ }
  return { ok: true };
}

/**
 * Takibi durdurur, tamponlanan noktalardan mesafeyi hesaplar ve
 * yeterli mesafe varsa backend'e kaydeder. Kazanılan rozet/kuponları döndürür.
 */
async function stopTrackingUnlocked(): Promise<RecordDriveResult | null> {
  const Location = loadLocation();
  if (Location) {
    // OS durdurmayı reddederse kullanıcıya hata ilet; oturumu temizleme.
    if (await Location.hasStartedLocationUpdatesAsync(TRACKING.taskName)) {
      await Location.stopLocationUpdatesAsync(TRACKING.taskName);
    }
  }
  try { await setTrackingEnabled(false); } catch { /* yerel sürüş yine saklanır */ }

  const rawMeta = await AsyncStorage.getItem(SESSION_KEY);
  const meta: SessionMeta | null = rawMeta ? JSON.parse(rawMeta) : null;
  const { data: { session: authSession } } = await supabase.auth.getSession();
  const user = authSession?.user;
  if (!meta || !user || meta.userId !== user.id) {
    throw new Error('Sürüş kaydı bu oturuma ait değil.');
  }

  const result = await saveBufferedDrive();
  await AsyncStorage.multiRemove([BUFFER_KEY, SESSION_KEY]);
  if (result) {
    await scheduleEndOfDayFuelSummaryForVehicle(meta.vehicleId ?? null);
  }
  return result;
}

/** Retry unsent intervals on dashboard refresh without restarting location collection. */
export function retryPendingDrives() {
  return serializeTracking(async () => {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const meta: SessionMeta = JSON.parse(raw);
    const result = await saveBufferedDrive();
    // Çevrimdışı durdurmadan sonra sunucu göstergesini gerçek OS durumuyla eşitle.
    try { await setTrackingEnabled(await isTracking()); } catch { /* sonraki yenilemede tekrar dene */ }
    if (result) await scheduleEndOfDayFuelSummaryForVehicle(meta.vehicleId ?? null);
    return result;
  });
}

export interface TrackingSnapshot {
  active: boolean;
  vehicleId: string | null;
  bufferedKm: number;
  latestFixAt: number | null;
  pendingUpload: boolean;
}

/** Read a consistent owner-bound snapshot without uploading data or requesting GPS. */
export function getTrackingSnapshot(): Promise<TrackingSnapshot> {
  return serializeTracking(async () => {
    const empty = { active: false, vehicleId: null, bufferedKm: 0, latestFixAt: null, pendingUpload: false };
    const rawMeta = await AsyncStorage.getItem(SESSION_KEY);
    const { data: { session } } = await supabase.auth.getSession();
    const meta: SessionMeta | null = rawMeta ? JSON.parse(rawMeta) : null;
    if (!meta || !session?.user || meta.userId !== session.user.id) return empty;
    const points: BufferPoint[] = JSON.parse(await AsyncStorage.getItem(BUFFER_KEY) ?? '[]');
    const latest = [...points].reverse().find(p => Number.isFinite(p.t) && p.t <= Date.now()
      && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90
      && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180
      && p.accuracy != null && Number.isFinite(p.accuracy) && p.accuracy >= 0 && p.accuracy <= 50);
    return {
      active: await isTracking(), vehicleId: meta.vehicleId ?? null,
      bufferedKm: Number(computeDistance(points).distanceKm.toFixed(2)),
      latestFixAt: latest?.t ?? null, pendingUpload: !!meta.pending,
    };
  });
}

/** The buffered interval stays separate from saved totals to avoid double counting retries. */
export async function getLiveSessionKm(): Promise<number> {
  return (await getTrackingSnapshot()).bufferedKm;
}

// ── Manuel / Simülasyon (test ve GPS'siz cihazlar için) ─────
export async function addManualDrive(km: number, vehicleId?: string | null): Promise<RecordDriveResult | null> {
  if (!km || km <= 0) return null;
  return recordDrive({
    distanceKm: Number(km.toFixed(2)),
    durationSec: Math.round((km / 50) * 3600), // ~50 km/s varsayımı
    source: 'manual',
    vehicleId: vehicleId ?? null,
  });
}

/** Geliştirme/demo: sensör olmadan rastgele bir sürüş üretir. */
export async function simulateDrive(vehicleId?: string | null): Promise<RecordDriveResult | null> {
  const km = 5 + Math.random() * 40;
  return recordDrive({
    distanceKm: Number(km.toFixed(1)),
    durationSec: Math.round((km / 45) * 3600),
    source: 'simulated',
    vehicleId: vehicleId ?? null,
  });
}

export function startTracking(vehicleId?: string | null) {
  return serializeTracking(() => startTrackingUnlocked(vehicleId));
}

export function stopTracking() {
  return serializeTracking(stopTrackingUnlocked);
}

/** Stop collecting location after sign-out; keep unsent mileage bound to its owner. */
export async function pauseTrackingOnSignOut() {
  return serializeTracking(async () => {
    const Location = loadLocation();
    if (Location && await isTracking()) await Location.stopLocationUpdatesAsync(TRACKING.taskName);
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith('fuel_daily_scheduled_'));
    const N = (() => { try { return require('expo-notifications'); } catch { return null; } })();
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (raw && N) {
        const saved = JSON.parse(raw);
        if (saved.notificationId) await N.cancelScheduledNotificationAsync(saved.notificationId);
      }
    }
    await AsyncStorage.multiRemove(keys);
  });
}

/** Erase only this deleted account's locally buffered location and summary data. */
export function clearDeletedAccountTracking(userId: string) {
  return serializeTracking(async () => {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw && JSON.parse(raw).userId === userId) {
      const Location = loadLocation();
      if (Location && await isTracking()) await Location.stopLocationUpdatesAsync(TRACKING.taskName);
      await AsyncStorage.multiRemove([BUFFER_KEY, SESSION_KEY]);
    }
    const keys = (await AsyncStorage.getAllKeys()).filter(key =>
      (key.startsWith('fuel_daily_scheduled_') || key.startsWith('fuel_daily_notified_')) && key.split(':')[1] === userId);
    await AsyncStorage.multiRemove(keys);
  });
}
