/**
 * Sürüş Asistanı — Yakıt Masrafı Tahmini
 * --------------------------------------
 * KM sayacından gelen günlük mesafeyi, aracın modeline (yakıt tipi +
 * motor hacmi) göre tahmini tüketim ve güncel pompa fiyatlarıyla
 * çarpıp gün sonu yakıt masrafını hesaplar.
 *
 * Gün sonu özeti iki kanaldan verilir:
 *  1) Dashboard'daki "Günün Yakıt Masrafı" kartı (canlı, bugünün toplamı)
 *  2) Yerel bildirim: uygulama yeni bir günde ilk açıldığında, önceki
 *     günün toplam km'si ve tahmini masrafı bildirilir (gün başına 1 kez).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { getPublicFuelPrice } from './priceFeed';
import { readDriveHistory, intervalKm } from './history';
import { prepareNotifications, DEFAULT_NOTIFICATION_CHANNEL } from '../notificationSetup';

// Yakıt tipine göre baz tüketim (1.6 motor referansı, birim/100 km)
const BASE_CONSUMPTION: Record<string, number> = {
  benzin: 7.2,
  dizel: 5.4,
  lpg: 9.0,
  hibrit: 4.6,
  elektrik: 16.0, // kWh/100km
};

export interface FuelVehicle {
  id?: string | null;
  brand?: string;
  model?: string;
  year?: string | number | null;
  fuelType?: string | null; // 'Benzin' | 'Dizel' | 'LPG' | 'Hibrit' | 'Elektrik'
  engine?: string | null;   // örn. "1.6 TDI"
  customConsumption?: number | null; // kullanıcının girdiği gerçek ortalama
  city?: string | null;
}

export interface FuelEstimate {
  km: number;
  consumptionPer100: number | null; // birim/100km
  consumptionSource: 'custom' | 'catalog' | 'estimate' | 'unavailable';
  consumptionReference?: string | null;
  amount: number | null;            // toplam litre veya kWh
  cost: number | null;              // ₺
  unit: string;              // 'L' | 'kWh'
  priceObservedAt?: string | null;
  priceSource?: string | null;
  fuelKey: string;           // normalize yakıt tipi
  fuelLabel: string;         // görünen ad
}

const FUEL_LABELS: Record<string, string> = {
  benzin: 'Benzin', dizel: 'Dizel', lpg: 'LPG', hibrit: 'Hibrit', elektrik: 'Elektrik',
};

function normalizeFuel(fuelType?: string | null): string {
  const f = (fuelType || '').toLocaleLowerCase('tr-TR').trim();
  if (f.includes('dizel') || f.includes('diesel')) return 'dizel';
  if (f.includes('lpg')) return 'lpg';
  if (f.includes('hibrit') || f.includes('hybrid')) return 'hibrit';
  if (f.includes('elektrik') || f.includes('electric')) return 'elektrik';
  if (f === 'benzin' || f === 'petrol' || f === 'gasoline') return 'benzin';
  return 'unknown';
}

/** Motor tanımından hacmi çıkarır: "1.6 TDI" -> 1.6, bulunamazsa 1.6. */
function parseDisplacement(engine?: string | null): number {
  const m = (engine || '').match(/(\d)[.,](\d)/);
  if (!m) return 1.6;
  const v = Number(`${m[1]}.${m[2]}`);
  return v >= 0.6 && v <= 8 ? v : 1.6;
}

/**
 * Araç modeline göre 100 km başına tahmini tüketim.
 * Baz değer 1.6 motor içindir; motor hacmi büyüdükçe/küçüldükçe
 * tüketim orantılı ayarlanır (hacim etkisi ~%60 ağırlıkla).
 */
export function estimateConsumptionPer100(vehicle: FuelVehicle): { value: number | null; fuelKey: string } {
  const fuelKey = normalizeFuel(vehicle.fuelType);
  if (fuelKey === 'unknown') return { value: null, fuelKey };
  const custom = Number(vehicle.customConsumption);
  if (Number.isFinite(custom) && custom >= 1 && custom <= 50) return { value: custom, fuelKey };
  const base = BASE_CONSUMPTION[fuelKey] ?? BASE_CONSUMPTION.benzin;
  if (fuelKey === 'elektrik') return { value: base, fuelKey }; // hacim anlamsız
  const disp = parseDisplacement(vehicle.engine);
  const factor = 1 + 0.6 * ((disp - 1.6) / 1.6);
  return { value: Math.max(3, base * factor), fuelKey };
}

/**
 * Marka/model/yıl/motor için yönetilen referans tüketimi bulur. Kullanıcı kendi
 * tüketimini girdiyse her zaman o değer önceliklidir. Katalog kaydı yoksa motor
 * hacmine dayalı güvenli tahmin kullanılır.
 */
async function resolveConsumptionPer100(vehicle: FuelVehicle): Promise<{ value: number | null; fuelKey: string; source: FuelEstimate['consumptionSource']; reference?: string | null }> {
  const local = estimateConsumptionPer100(vehicle);
  if (local.value === null) return { ...local, source: 'unavailable' };
  const custom = Number(vehicle.customConsumption);
  if (Number.isFinite(custom) && custom >= 1 && custom <= 50) return { ...local, source: 'custom' };
  const fallback = { ...local, source: 'estimate' as const };
  const year = Number(vehicle.year);
  // Incomplete vehicle details must not match an arbitrary year or engine.
  if (!vehicle.brand?.trim() || !vehicle.model?.trim() || !vehicle.engine?.trim() ||
      !vehicle.fuelType?.trim() || !Number.isInteger(year) || year <= 1900) return fallback;
  const literal = (value: string) => value.trim().replace(/[\\%_]/g, '\\$&');

  try {
    let query = supabase
      .from('vehicle_consumption_defaults')
      .select('consumption_per_100,source')
      .ilike('brand', literal(vehicle.brand))
      .ilike('model', literal(vehicle.model))
      .eq('fuel_type', local.fuelKey)
      .eq('is_active', true);

    query = query.lte('year_from', year).gte('year_to', year)
      .ilike('engine', literal(vehicle.engine));

    const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const value = Number(data?.consumption_per_100);
    if (!error && Number.isFinite(value) && value >= 1 && value <= 50) return { value, fuelKey: local.fuelKey, source: 'catalog', reference: data?.source || null };
  } catch {
    // Referans tüketim kataloğu yoksa tahminle devam edilir.
  }
  return fallback;
}

/** Önce yönetilen fiyatı, yoksa doğrulanan halka açık fiyat tablosunu kullanır. */
export async function getActiveFuelPrice(fuelKey: string, city?: string | null): Promise<{ unitPrice: number; unit: string; observedAt: string; source: string } | null> {
  // Hibrit araçlar benzin fiyatını kullanır. Tarihsiz/sabit fiyatı güncel sayma.
  const key = fuelKey === 'hibrit' ? 'benzin' : fuelKey;
  const now = new Date();
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const lookup = async (localCity?: string) => {
    let query = supabase.from('fuel_price_snapshots')
      .select('unit_price,unit,observed_at,source')
      .eq('fuel_type', key)
      .gte('observed_at', since.toISOString())
      .lte('observed_at', now.toISOString());
    query = localCity ? query.eq('city', localCity) : query.is('city', null);
    const { data, error } = await query.order('observed_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const price = Number(data?.unit_price);
    const expectedUnit = key === 'elektrik' ? 'kWh' : 'L';
    return data && Number.isFinite(price) && price > 0 && data.unit === expectedUnit
      ? { unitPrice: price, unit: data.unit, observedAt: data.observed_at, source: data.source || 'Yönetilen yakıt fiyatı' } : null;
  };
  try {
    if (city?.trim()) {
      const local = await lookup(city.trim());
      if (local) return local;
    }
    const national = await lookup();
    if (national) return national;
  } catch { /* bağımsız fiyat kaynağını dene */ }
  return getPublicFuelPrice(fuelKey, city);
}

export async function estimateFuelCostWithLatestPrice(km: number, vehicle: FuelVehicle): Promise<FuelEstimate> {
  const { value: consumptionPer100, fuelKey, source: consumptionSource, reference: consumptionReference } = await resolveConsumptionPer100(vehicle);
  const price = consumptionPer100 === null ? null : await getActiveFuelPrice(fuelKey, vehicle.city);
  const amount = consumptionPer100 === null ? null : (Math.max(0, Number.isFinite(km) ? km : 0) / 100) * consumptionPer100;
  return { km, consumptionPer100, consumptionSource, consumptionReference, amount, cost: price && amount !== null ? amount * price.unitPrice : null, unit: price?.unit ?? (fuelKey === 'unknown' ? '—' : fuelKey === 'elektrik' ? 'kWh' : 'L'), priceObservedAt: price?.observedAt ?? null, priceSource: price?.source ?? null, fuelKey, fuelLabel: FUEL_LABELS[fuelKey] ?? 'Yakıt türü eksik' };
}

// ── Günlük km sorguları ─────────────────────────────────────
async function getKmBetween(start: Date, end: Date, vehicle: FuelVehicle): Promise<number> {
  if (!vehicle.id) return 0;
  const data = await readDriveHistory({ start, end, vehicleId: vehicle.id, automaticOnly: true });
  return data.reduce((sum, drive) => sum + intervalKm(drive, start, end), 0);
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Bugünün toplam km'si ve tahmini yakıt masrafı. */
export async function getTodayFuelSummary(vehicle: FuelVehicle): Promise<FuelEstimate> {
  const now = new Date();
  const start = dayStart(now);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const km = await getKmBetween(start, end, vehicle);
  return estimateFuelCostWithLatestPrice(km, vehicle);
}

/** İçinde bulunulan ayın toplam mesafesi ve tahmini yakıt masrafı. */
export async function getMonthFuelSummary(vehicle: FuelVehicle, year?: number, month?: number): Promise<FuelEstimate> {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  const km = await getKmBetween(start, end, vehicle);
  return estimateFuelCostWithLatestPrice(km, vehicle);
}

// ── Gün sonu bildirimi ──────────────────────────────────────
const DAILY_NOTIFIED_KEY = 'fuel_daily_notified_v1';
const DAILY_SCHEDULE_KEY = 'fuel_daily_scheduled_v2';
const summaryQueue = new Map<string, Promise<unknown>>();
function serializeSummary(key: string, work: () => Promise<void>): Promise<void> {
  const next = (summaryQueue.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
  summaryQueue.set(key, next);
  return next.finally(() => { if (summaryQueue.get(key) === next) summaryQueue.delete(key); });
}

async function notificationKeys(vehicle: FuelVehicle) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !vehicle.id) return null;
  return { notified: `${DAILY_NOTIFIED_KEY}:${user.id}:${vehicle.id}`, scheduled: `${DAILY_SCHEDULE_KEY}:${user.id}:${vehicle.id}` };
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function loadNotifications(): any {
  try { return require('expo-notifications'); } catch { return null; }
}

/**
 * Yeni bir günde ilk açılışta, önceki günün sürüş özetini bildirir.
 * Aynı gün için tekrar bildirim göndermez; önceki gün sürüş yoksa sessiz kalır.
 */
async function checkAndNotifyDailyFuelSummaryUnlocked(vehicle: FuelVehicle): Promise<void> {
  try {
    const keys = await notificationKeys(vehicle);
    if (!keys) return;
    const N = loadNotifications();
    if (!N || (await N.getPermissionsAsync())?.status !== 'granted') return;
    await prepareNotifications(N);
    const todayKey = localDayKey(new Date());
    const last = await AsyncStorage.getItem(keys.notified);
    const today = dayStart(new Date());
    const yStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const yEnd = dayStart(new Date());
    const yesterdayKey = localDayKey(yStart);
    const scheduledRaw = await AsyncStorage.getItem(keys.scheduled);
    const scheduled = scheduledRaw ? JSON.parse(scheduledRaw) : null;
    const km = await getKmBetween(yStart, yEnd, vehicle);
    if (km < 0.5) return;
    const notified = last?.startsWith('{') ? JSON.parse(last) : null;
    if (notified?.day === todayKey && notified.km === km) return;
    // A late/offline upload can change yesterday after its first summary.
    if (scheduled?.day === yesterdayKey && scheduled.km === km) {
      await AsyncStorage.setItem(keys.notified, JSON.stringify({day: todayKey, km}));
      return;
    }

    const est = await estimateFuelCostWithLatestPrice(km, vehicle);
    await N.scheduleNotificationAsync({
      content: {
        title: '⛽️ Dünün Yakıt Özeti',
        body: est.consumptionSource === 'unavailable'
          ? 'Sürüş mesafeniz kaydedildi. Masraf hesabı için aracınızın yakıt türünü tamamlayın.'
          : est.cost === null
          ? `Dün ${Math.round(est.km)} km sürdünüz. Güncel yakıt fiyatına ulaşılamadığı için masraf hesaplanamadı.`
          : `Dün ${Math.round(est.km)} km sürdünüz. ${vehicle.brand ?? ''} ${vehicle.model ?? ''} (${est.fuelLabel}) için tahmini yakıt masrafı ~${Math.round(est.cost).toLocaleString('tr-TR')} ₺ (${est.amount?.toFixed(1)} ${est.unit}).`,
        data: { type: 'fuel_daily_summary' },
      },
      trigger: { channelId: DEFAULT_NOTIFICATION_CHANNEL },
    });
    await AsyncStorage.setItem(keys.notified, JSON.stringify({day: todayKey, km}));
  } catch { /* sessiz geç — bildirim kritik değil */ }
}

/**
 * Bugünkü sürüş özeti için aynı gün 23:30'a tek bir bildirim planlar. Yeni bir
 * sürüş kaydedilince eski plan yenilenir; böylece metindeki km ve ücret güncel
 * kalır. Uygulama o saatte kapalı olsa da işletim sistemi bildirimi gösterir.
 */
async function scheduleEndOfDayFuelSummaryUnlocked(vehicle: FuelVehicle): Promise<void> {
  try {
    const keys = await notificationKeys(vehicle);
    if (!keys) return;
    const N = loadNotifications();
    if (!N) return;
    const permission = await N.getPermissionsAsync();
    if (permission?.status !== 'granted') return;
    await prepareNotifications(N);

    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30, 0, 0);
    const fireAt = cutoff.getTime() > now.getTime() ? cutoff : new Date(now.getTime() + 5000);

    const est = await getTodayFuelSummary(vehicle);
    if (est.km < 0.5) return;

    const oldRaw = await AsyncStorage.getItem(keys.scheduled);
    const old = oldRaw ? JSON.parse(oldRaw) : null;
    if (old?.day === localDayKey(now) && old.km === est.km && old.cost === est.cost) return;
    if (old?.notificationId) {
      try { await N.cancelScheduledNotificationAsync(old.notificationId); } catch { /* eski plan yok */ }
    }

    const notificationId = await N.scheduleNotificationAsync({
      content: {
        title: '⛽️ Günün Yakıt Özeti',
        body: est.consumptionSource === 'unavailable'
          ? 'Sürüş mesafeniz kaydedildi. Masraf hesabı için aracınızın yakıt türünü tamamlayın.'
          : est.cost === null
          ? `Bugün ${est.km.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km sürdünüz. Güncel yakıt fiyatına ulaşılamadığı için masraf hesaplanamadı.`
          : `Bugün ${est.km.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km sürdünüz. ${vehicle.brand ?? ''} ${vehicle.model ?? ''} için tahmini yakıt masrafınız ~${Math.round(est.cost).toLocaleString('tr-TR')} ₺.`,
        data: { type: 'fuel_daily_summary' },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: DEFAULT_NOTIFICATION_CHANNEL },
    });

    await AsyncStorage.setItem(keys.scheduled, JSON.stringify({
      day: localDayKey(now),
      notificationId,
      km: est.km, cost: est.cost,
    }));
  } catch { /* planlama başarısızsa ertesi açılış kontrolü yedek olarak çalışır */ }
}

export async function checkAndNotifyDailyFuelSummary(vehicle: FuelVehicle): Promise<void> {
  const keys = await notificationKeys(vehicle).catch(() => null);
  if (keys) await serializeSummary(keys.scheduled, () => checkAndNotifyDailyFuelSummaryUnlocked(vehicle));
}

export async function scheduleEndOfDayFuelSummary(vehicle: FuelVehicle): Promise<void> {
  const keys = await notificationKeys(vehicle).catch(() => null);
  if (keys) await serializeSummary(keys.scheduled, () => scheduleEndOfDayFuelSummaryUnlocked(vehicle));
}

/** Arka plan sürüş görevinin kullanabileceği araç çözümleyici. */
export async function scheduleEndOfDayFuelSummaryForVehicle(vehicleId?: string | null): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    let query = supabase.from('vehicles').select('id,brand,model,year,fuel_type,engine').eq('user_id', user.id);
    if (vehicleId) query = query.eq('id', vehicleId);
    const { data: vehicle } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!vehicle) return;
    const { data: preference } = await supabase
      .from('vehicle_fuel_preferences')
      .select('custom_consumption_per_100')
      .eq('user_id', user.id)
      .eq('vehicle_id', vehicle.id)
      .maybeSingle();
    const context: FuelVehicle = {
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      fuelType: vehicle.fuel_type,
      engine: vehicle.engine,
      customConsumption: Number(preference?.custom_consumption_per_100) || null,
    };
    await checkAndNotifyDailyFuelSummary(context);
    await scheduleEndOfDayFuelSummary(context);
  } catch { /* arka plan görevi kullanıcı deneyimini kesmemeli */ }
}
