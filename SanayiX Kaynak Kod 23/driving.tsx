import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Platform, Alert, RefreshControl, Switch, TextInput, AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { router, useFocusEffect } from 'expo-router';
import { saveConsumptionPreference } from '../../lib/vehicleConsumption';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import { PREMIUM_SHADOW } from '../../lib/gradients';
import { MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import { BADGES, COUPONS, nextBadge, TIER_COLORS, pointsForKm } from '../../lib/driving/config';
import {
  getDrivingProfile, getUserBadges, getUserCoupons, getWeeklyLeaderboard,
  DrivingProfile, LeaderboardRow, UserCoupon,
} from '../../lib/driving/api';
import {
  getPermissionState, requestPermissions, isTracking, startTracking, stopTracking, retryPendingDrives,
  simulateDrive, getTrackingSnapshot, TrackingSnapshot,
} from '../../lib/driving/tracking';
import { registerForPush, scheduleNotificationTest } from '../../lib/driving/notifications';
import {
  getMaintenanceStatuses, nearestMaintenance, checkAndNotifyMaintenance,
  MaintenanceStatus, VehicleContext,
} from '../../lib/driving/maintenance';
import {
  getTodayFuelSummary, getMonthFuelSummary, checkAndNotifyDailyFuelSummary,
  scheduleEndOfDayFuelSummary, FuelEstimate,
} from '../../lib/driving/fuel';
import { specialtyToCategoryId } from '../../lib/serviceCategories';

export default function DrivingScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<DrivingProfile | null>(null);
  const [earnedBadges, setEarnedBadges] = useState<string[]>([]);
  const [coupons, setCoupons] = useState<UserCoupon[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus[]>([]);
  const [fuel, setFuel] = useState<FuelEstimate | null>(null);
  const [monthlyFuel, setMonthlyFuel] = useState<FuelEstimate | null>(null);
  const [vehicle, setVehicle] = useState<VehicleContext | null>(null);
  const [vehicles, setVehicles] = useState<VehicleContext[]>([]);
  const selectedVehicleId = useRef<string | null>(null);
  const [live, setLive] = useState<TrackingSnapshot | null>(null);
  const [tracking, setTrackingState] = useState(false);
  const [busy, setBusy] = useState(false);
  const consumptionLock = useRef(false);
  const [consumptionInput, setConsumptionInput] = useState('');
  const [pendingUpload, setPendingUpload] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const consumptionEditing = useRef(false);

  const load = useCallback(async () => {
    const { data: u, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    setLoadError('');
    const uid = u?.user?.id;
    setPendingUpload(false);
    if (uid) {
      try { await retryPendingDrives(); }
      catch { setPendingUpload(true); }
    }

    const snapshot = await getTrackingSnapshot();
    setLive(snapshot);
    // Etkin sürüşün aracı korunur; diğer durumlarda kullanıcı aracını seçebilir.
    let vctx: VehicleContext | null = null;
    if (uid) {
      const { data: rows, error } = await supabase
        .from('vehicles').select('id,brand,model,year,fuel_type,engine,mileage').eq('user_id', uid)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const preferredId = (snapshot.active || snapshot.pendingUpload) ? snapshot.vehicleId : selectedVehicleId.current;
      const v = rows?.find(row => row.id === preferredId) ?? rows?.[0];
      const choices = (rows ?? []).map(row => ({ id: row.id, brand: row.brand, model: row.model, year: row.year, engine: row.engine, fuelType: row.fuel_type, baseMileage: Number(row.mileage) || 0 }));
      setVehicles(choices);
      selectedVehicleId.current = v?.id ?? null;
      if (v) {
        const { data: preference, error: preferenceError } = await supabase
          .from('vehicle_fuel_preferences')
          .select('custom_consumption_per_100')
          .eq('user_id', uid)
          .eq('vehicle_id', v.id)
          .maybeSingle();
        if (preferenceError) throw preferenceError;
        vctx = {
          id: v.id,
          brand: v.brand,
          model: v.model,
          year: v.year,
          fuelType: v.fuel_type,
          engine: v.engine,
          customConsumption: Number(preference?.custom_consumption_per_100) || null,
          baseMileage: Number(v.mileage) || 0,
        };
        if (!consumptionEditing.current) setConsumptionInput(preference?.custom_consumption_per_100
          ? String(preference.custom_consumption_per_100)
          : '');
      }
      else { vctx = { id: null, baseMileage: 0 }; setConsumptionInput(''); }
    }
    setVehicle(vctx);

    const [prof, badges, coups, board, maint, isTrk, fuelSum, monthFuelSum] = await Promise.all([
      getDrivingProfile(),
      getUserBadges(),
      getUserCoupons(),
      getWeeklyLeaderboard(10),
      vctx?.id ? checkAndNotifyMaintenance(vctx).catch(() => []) : Promise.resolve([]),
      isTracking(),
      getTodayFuelSummary(vctx ?? {}).catch(() => null),
      getMonthFuelSummary(vctx ?? {}).catch(() => null),
    ]);
    setProfile(prof);
    setEarnedBadges(badges);
    setCoupons(coups);
    setLeaderboard(board);
    setMaintenance(maint);
    setTrackingState(isTrk);
    setFuel(fuelSum);
    setMonthlyFuel(monthFuelSum);
    if (vctx) {
      checkAndNotifyDailyFuelSummary(vctx); // önceki gün için çevrimdışı yedek kontrol
      scheduleEndOfDayFuelSummary(vctx); // uygulama kapalıyken de 23:30 özeti
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (err: any) {
        setLoadError(err?.message || 'Sürüş bilgileri yüklenemedi. Bağlantınızı kontrol edin.');
      } finally {
        setLoading(false);
        registerForPush().catch(() => {});
      }
    })();
  }, [load]);

  useFocusEffect(useCallback(() => {
    let active = true, polling = false, ticks = 0;
    const poll = async () => {
      if (!active || polling || AppState.currentState !== 'active') return;
      polling = true;
      try {
        const snapshot = await getTrackingSnapshot();
        if (!active) return;
        setLive(snapshot); setTrackingState(snapshot.active);
        if (snapshot.pendingUpload) setPendingUpload(true);
        // Refresh saved totals at most once a minute while the dashboard is visible.
        if (++ticks % 12 === 0 && snapshot.active) await load();
      } catch { /* a temporary local read failure leaves the last visible state intact */ }
      finally { polling = false; }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { void poll(); void load().catch(() => setLoadError('Sürüş bilgileri yenilenemedi. Bağlantınızı kontrol edin.')); }
    });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [load]));

  const selectVehicle = async (id: string | null) => {
    if (busy || tracking || pendingUpload || !id || id === selectedVehicleId.current) return;
    setBusy(true); consumptionEditing.current = false; selectedVehicleId.current = id;
    try { await load(); }
    catch (error: any) { Alert.alert('Araç yüklenemedi', error?.message || 'Bağlantınızı kontrol edin.'); }
    finally { setBusy(false); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); }
    catch (error: any) { Alert.alert('Yenilenemedi', error?.message || 'Bağlantınızı kontrol edin.'); }
    finally { setRefreshing(false); }
  };

  const testNotification = async () => {
    if (notificationBusy) return;
    setNotificationBusy(true);
    try {
      await scheduleNotificationTest();
      Alert.alert('Test bildirimi planlandı', 'Yaklaşık 5 saniye içinde bir bildirim görmelisiniz. İsterseniz uygulamayı arka plana alarak da kontrol edebilirsiniz.');
    } catch (error: any) { Alert.alert('Bildirim testi', error?.message || 'Bildirim planlanamadı. Tekrar deneyin.'); }
    finally { setNotificationBusy(false); }
  };

  const toggleTracking = async (val: boolean) => {
    setBusy(true);
    try {
      if (val) {
        if (!vehicle?.id) {
          Alert.alert('Araç gerekli', 'Takibi açmadan önce bir araç ekleyin.');
          return;
        }
        const perm = await getPermissionState();
        if (!perm.available) {
          Alert.alert(
            'Konum modülü bulunamadı',
            'Otomatik takip için uygulamanın konum destekli sürümü gerekir. Şimdilik "Test Sürüşü Ekle" ile deneyebilirsiniz.'
          );
          setBusy(false);
          return;
        }
        let p = perm;
        if (!p.foreground || !p.background) {
          const userAgreed = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Arka Plan Konum Erişimi',
              'SanayiX, sürüş asistanı özelliği ile kat ettiğiniz kilometreyi, tahmini yakıt masrafınızı ve periyodik bakımlarınızı hesaplamak için uygulama kapalıyken veya kullanılmıyorken bile konum verilerinizi toplar.\n\nSürüşlerinizi otomatik kaydetmek için sonraki ekranlarda konum erişimine "Her Zaman İzin Ver" seçeneğini seçmelisiniz.',
              [
                { text: 'İptal', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Anladım', onPress: () => resolve(true) }
              ],
              { cancelable: false }
            );
          });

          if (!userAgreed) {
            setBusy(false);
            return;
          }

          p = await requestPermissions();
        }
        
        if (!p.foreground) {
          Alert.alert('İzin Gerekli', 'Sürüş takibi için konum izni vermelisiniz.');
          setBusy(false);
          return;
        }
        if (!p.background) {
          Alert.alert(
            'Arka Plan İzni',
            'Otomatik sürüş takibi için konum iznini "Her Zaman" olarak ayarlayın.'
          );
          return;
        }
        const res = await startTracking(vehicle?.id ?? null);
        if (res.ok) setTrackingState(true);
        else Alert.alert('Başlatılamadı', res.reason ?? 'Bilinmeyen hata');
      } else {
        const result = await stopTracking();
        setTrackingState(false);
        if (result) {
          await load();
          if (result.new_badges?.length) {
            Alert.alert('🏅 Yeni Rozet!', result.new_badges.map((b) => `${b.icon} ${b.name}`).join('\n'));
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Sürüş kaydı', error?.message ?? 'İşlem tamamlanamadı.');
    } finally {
      // Stopping GPS can succeed even when uploading mileage fails.
      const snapshot = await getTrackingSnapshot().catch(() => null);
      if (snapshot) { setLive(snapshot); setTrackingState(snapshot.active); setPendingUpload(snapshot.pendingUpload); }
      setBusy(false);
    }
  };

  const runSimulate = async () => {
    setBusy(true);
    const res = await simulateDrive(vehicle?.id ?? null);
    await load();
    setBusy(false);
    if (res?.new_badges?.length) {
      Alert.alert('🏅 Yeni Rozet Kazandın!', res.new_badges.map((b) => `${b.icon} ${b.name}`).join('\n'));
    } else if (res) {
      Alert.alert('Sürüş Eklendi', `+${res.points - pointsForKm((profile?.total_km ?? 0))} puan hesaba geçti.`);
    }
  };

  const saveConsumption = async (reset = false) => {
    if (consumptionLock.current || busy) return;
    if (!vehicle?.id) return Alert.alert('Araç gerekli', 'Önce profilinize bir araç ekleyin.');
    if (!reset && !consumptionInput.trim()) return Alert.alert('Tüketim girin', 'Kendi ortalamanızı girin veya otomatik hesabı seçin.');
    consumptionLock.current = true; setBusy(true);
    try {
      await saveConsumptionPreference(supabase, vehicle.id, reset ? '' : consumptionInput);
      consumptionEditing.current = false;
      await load();
      Alert.alert('Kaydedildi', reset ? 'Katalog eşleşmesi varsa o değer, yoksa genel tahmin kullanılacak.' : 'Yakıt tahminleri kendi ortalama tüketiminize göre güncellendi.');
    } catch (error: any) {
      Alert.alert('Kaydedilemedi', error?.message || 'Lütfen tekrar deneyin.');
    } finally { consumptionLock.current = false; setBusy(false); }
  };

  if (loading) {
    return <View style={st.center}><ActivityIndicator color={T.primary} /></View>;
  }

  const totalKm = profile?.total_km ?? 0;
  const points = profile?.points ?? 0;
  const nb = nextBadge(totalKm);
  const prevThreshold = nb ? (BADGES.filter((b) => b.kmThreshold <= totalKm).pop()?.kmThreshold ?? 0) : totalKm;
  const ringProgress = nb ? Math.min(1, (totalKm - prevThreshold) / (nb.kmThreshold - prevThreshold)) : 1;
  const nearest = nearestMaintenance(maintenance);

  return (
    <ScrollView
      style={st.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
    >
      {/* ── HERO ── */}
      <LinearGradient colors={['#05070A', '#21150A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
        <View style={st.heroTop}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={st.heroBack}>← Geri</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push({ pathname: '/user/driving-stats', params: { vehicleId: vehicle?.id ?? '' } })}>
            <Text style={st.heroStats}>İstatistikler ›</Text>
          </TouchableOpacity>
        </View>

        <Text style={st.heroLabel}>SÜRÜŞ ASİSTANI</Text>

        <View style={st.ringRow}>
          <ProgressRing progress={ringProgress} />
          <View style={{ flex: 1, marginLeft: 20 }}>
            <Text style={st.totalKm}>{totalKm.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}<Text style={st.kmUnit}> km</Text></Text>
            <Text style={st.totalKmSub}>Toplam sürüş mesafeniz</Text>
            {nb && (
              <View style={st.nextBadgePill}>
                <Text style={st.nextBadgePillTxt}>{nb.icon} {Math.ceil(nb.kmThreshold - totalKm).toLocaleString('tr-TR')} km sonra "{nb.name}"</Text>
              </View>
            )}
          </View>
        </View>

        <View style={st.heroStatsRow}>
          <View style={st.heroStatBox}>
            <Text style={st.heroStatVal}>{points.toLocaleString('tr-TR')}</Text>
            <Text style={st.heroStatLbl}>SanayiX Puan</Text>
          </View>
          <View style={st.heroDivider} />
          <View style={st.heroStatBox}>
            <Text style={st.heroStatVal}>{profile?.total_drives ?? 0}</Text>
            <Text style={st.heroStatLbl}>Sürüş</Text>
          </View>
          <View style={st.heroDivider} />
          <View style={st.heroStatBox}>
            <Text style={st.heroStatVal}>{earnedBadges.length}</Text>
            <Text style={st.heroStatLbl}>Rozet</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={st.body}>
        {!!loadError && <View style={st.card}><Text style={st.fuelNote} accessibilityRole="alert">{loadError}</Text><TouchableOpacity style={st.simBtn} onPress={onRefresh} disabled={refreshing} accessibilityRole="button"><Text style={st.simBtnTxt}>Yeniden dene</Text></TouchableOpacity></View>}
        {/* ── Otomatik Takip ── */}
        <View style={[st.card, PREMIUM_SHADOW.soft]}>
          <View style={st.trackRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.trackTitle}>Otomatik KM Takibi {tracking ? '🟢' : '⚪️'}</Text>
              <Text style={st.trackSub}>
                {tracking ? 'Sürüşünüz arka planda takip ediliyor.' : 'Açtığınızda sürüşleriniz otomatik kaydedilir.'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Otomatik kilometre takibi"
              value={tracking}
              onValueChange={toggleTracking}
              disabled={busy}
              trackColor={{ false: T.surfaceSoft, true: T.primaryDeep }}
              thumbColor="#fff"
            />
          </View>
          <View style={st.vehicleChoices}>
            <Text style={st.consumptionLabel}>TAKİP EDİLEN ARAÇ</Text>
            {vehicles.length ? vehicles.map(choice => (
              <TouchableOpacity key={choice.id} style={[st.vehicleChoice, vehicle?.id === choice.id && st.vehicleChoiceSelected]}
                onPress={() => selectVehicle(choice.id)} disabled={busy || tracking || pendingUpload}
                accessibilityRole="radio" accessibilityState={{ checked: vehicle?.id === choice.id, disabled: busy || tracking || pendingUpload }}>
                <Text style={st.vehicleChoiceTitle}>{choice.brand} {choice.model} · {choice.year}</Text>
                <Text style={st.fuelNote}>{choice.engine || 'Motor bilgisi eksik'} · {choice.fuelType || 'Yakıt türü eksik'}</Text>
              </TouchableOpacity>
            )) : <TouchableOpacity style={st.simBtn} onPress={() => router.push('/user/my-vehicles')} accessibilityRole="button"><Text style={st.simBtnTxt}>Araç ekle</Text></TouchableOpacity>}
            {tracking && vehicles.length > 1 && <Text style={st.fuelNote}>Araç değiştirmek için önce takibi durdurun.</Text>}
          </View>
          {live && (live.active || live.bufferedKm > 0) && (
            <View style={st.liveMileage}>
              <Text style={st.sectionTitle}>{live.bufferedKm.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} km</Text>
              <Text style={st.trackSub}>Telefonda bekleyen mesafe</Text>
              <Text style={st.fuelNote}>{live.active ? (!live.latestFixAt || Date.now() - live.latestFixAt > 120000 ? 'Hassas konum bekleniyor. Açık alanda konum ve pil ayarlarınızı kontrol edin.' : 'Konum alınıyor. Sayaç sürüş sırasında yenilenir.') : 'Takip durdu.'} Bu mesafe sunucuya aktarıldıkça aşağıdaki kayıtlı toplamlara yansır.</Text>
            </View>
          )}
          {pendingUpload && (
            <Text style={st.fuelNote} accessibilityRole="alert">
              Aktarılamayan sürüş kayıtları telefonda saklanıyor. Toplamlar henüz eksik olabilir. Bağlantınız olduğunda ekranı aşağı çekerek yeniden deneyin.
            </Text>
          )}
          {pendingUpload && <TouchableOpacity style={st.simBtn} onPress={onRefresh} disabled={refreshing || busy} accessibilityRole="button"><Text style={st.simBtnTxt}>{refreshing ? 'Aktarılıyor…' : 'Bekleyen kayıtları yeniden dene'}</Text></TouchableOpacity>}
          {__DEV__ && (
            <TouchableOpacity style={st.simBtn} onPress={runSimulate} disabled={busy}>
              <Text style={st.simBtnTxt}>{busy ? '...' : '＋ Test Sürüşü Ekle (demo)'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Günün Yakıt Masrafı ── */}
        {fuel && (
          <View style={[st.card, PREMIUM_SHADOW.soft]}>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>⛽️ Günün Yakıt Masrafı</Text>
              <Text style={st.sectionHint}>
                {vehicle?.brand ? `${vehicle.brand} ${vehicle.model ?? ''} · ${fuel.fuelLabel}` : fuel.fuelLabel}
              </Text>
            </View>
            <View style={st.fuelRow}>
              <View style={st.fuelBox}>
                <Text style={st.fuelVal}>{fuel.km.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</Text>
                <Text style={st.fuelLbl}>km (kayıtlı)</Text>
              </View>
              <View style={st.fuelDivider} />
              <View style={st.fuelBox}>
                <Text style={st.fuelVal}>{fuel.amount?.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) ?? '—'}</Text>
                <Text style={st.fuelLbl}>{fuel.unit} tüketim</Text>
              </View>
              <View style={st.fuelDivider} />
              <View style={st.fuelBox}>
                <Text style={[st.fuelVal, { color: T.primary }]}>{fuel.cost === null ? '—' : `~${Math.round(fuel.cost).toLocaleString('tr-TR')} ₺`}</Text>
                <Text style={st.fuelLbl}>tahmini masraf</Text>
              </View>
            </View>
            {fuel.consumptionSource === 'unavailable' ? <Text style={st.fuelNote}>Aracınızın yakıt türü eksik veya tanınmıyor. Kilometre kaydı devam eder; tüketim ve masraf için araç bilgilerini tamamlayın.</Text> : <Text style={st.fuelNote}>
              {fuel.consumptionSource === 'custom' ? 'Girdiğiniz ortalama tüketim kullanılıyor. ' : fuel.consumptionSource === 'catalog' ? 'Kayıtlı araç bilgileriyle eşleşen katalog tüketimi kullanılıyor. ' : 'Bu araç için katalog değeri bulunamadı; motor ve yakıt türüne dayalı genel tahmin kullanılıyor. '}
              {fuel.consumptionPer100?.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {fuel.unit}/100 km tüketim varsayımıyla hesaplanır. {fuel.priceObservedAt ? `Kaynak: ${fuel.priceSource}. Kontrol: ${new Date(fuel.priceObservedAt).toLocaleString('tr-TR')}.` : 'Güncel yakıt fiyatı alınamadığı için masraf gösterilemiyor.'} Bildirim izniyle gün sonu özeti gönderilir.
            </Text>}
            {(fuel.consumptionSource === 'unavailable' || fuel.consumptionSource === 'estimate') && vehicle?.id && <TouchableOpacity style={st.simBtn} onPress={() => router.push({ pathname: '/user/complete-profile', params: { vehicleId: vehicle.id! } })}><Text style={st.simBtnTxt}>Araç ve motor bilgilerini düzenle</Text></TouchableOpacity>}
            {!!fuel.consumptionReference && <Text style={st.fuelNote}>{fuel.consumptionReference}</Text>}
            <TouchableOpacity style={st.simBtn} onPress={testNotification} disabled={notificationBusy} accessibilityRole="button">
              <Text style={st.simBtnTxt}>{notificationBusy ? 'Planlanıyor…' : 'Bildirimleri dene'}</Text>
            </TouchableOpacity>
            {monthlyFuel && (
              <View style={st.monthFuelRow}>
                <View>
                  <Text style={st.monthFuelLabel}>BU AY</Text>
                  <Text style={st.monthFuelMeta}>{monthlyFuel.km.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km · {monthlyFuel.amount?.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) ?? '—'} {monthlyFuel.unit}</Text>
                </View>
                <Text style={st.monthFuelCost}>{monthlyFuel.cost === null ? '—' : `~${Math.round(monthlyFuel.cost).toLocaleString('tr-TR')} ₺`}</Text>
              </View>
            )}
            {!!vehicle?.id && fuel.consumptionSource !== 'unavailable' && (
              <View style={st.consumptionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.consumptionLabel}>KENDİ ORTALAMA TÜKETİMİN</Text>
                  <Text style={st.consumptionHelp}>Daha doğru tahmin için 100 km değerini gir.</Text>
                </View>
                <TextInput
                  accessibilityLabel="100 kilometrede ortalama tüketim"
                  style={st.consumptionInput}
                  value={consumptionInput}
                  onChangeText={value => { consumptionEditing.current = true; setConsumptionInput(value); }}
                  keyboardType="decimal-pad"
                  placeholder={fuel.consumptionPer100?.toFixed(1) ?? '6.8'}
                  placeholderTextColor={T.textMuted}
                  maxLength={5}
                />
                <TouchableOpacity style={st.consumptionSave} onPress={() => saveConsumption()} disabled={busy}>
                  <Text style={st.consumptionSaveText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!vehicle?.id && fuel.consumptionSource === 'custom' && <TouchableOpacity style={st.simBtn} disabled={busy} onPress={() => saveConsumption(true)}><Text style={st.simBtnTxt}>Otomatik tüketim hesabına dön</Text></TouchableOpacity>}
          </View>
        )}

        {/* ── Bir Sonraki Bakım ── */}
        {nearest && (
          <TouchableOpacity
            style={[st.card, PREMIUM_SHADOW.soft]}
            activeOpacity={0.9}
            onPress={() => router.push({ pathname: '/user/mechanics', params: { category: nearest.item.relatedCategory, view: 'list' } } as any)}
          >
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>Bir Sonraki Bakım</Text>
              {nearest.warning && <View style={st.warnPill}><Text style={st.warnPillTxt}>Yaklaştı</Text></View>}
            </View>
            <View style={st.maintRow}>
              <Text style={st.maintIcon}>{nearest.item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.maintName}>{nearest.item.name}</Text>
                <Text style={st.maintRemain}>
                  {nearest.due ? 'Zamanı geldi!' : `~${Math.round(nearest.remainingKm).toLocaleString('tr-TR')} km kaldı`}
                </Text>
              </View>
              <Text style={st.maintArrow}>›</Text>
            </View>
            <ProgressBar progress={nearest.progress} warn={nearest.warning} />
            <Text style={st.maintCta}>Randevu almak için dokunun →</Text>
          </TouchableOpacity>
        )}

        {/* ── Bakım listesi (kısa) ── */}
        {maintenance.length > 1 && (
          <View style={[st.card, PREMIUM_SHADOW.soft]}>
            <Text style={st.sectionTitle}>Bakım Takvimi</Text>
            {maintenance.map((m) => (
              <View key={m.item.code} style={st.maintMiniRow}>
                <Text style={st.maintMiniIcon}>{m.item.icon}</Text>
                <Text style={st.maintMiniName}>{m.item.name}</Text>
                <Text style={[st.maintMiniKm, m.warning && { color: COLORS.warning }]}>
                  {m.due ? 'Şimdi' : `${Math.round(m.remainingKm).toLocaleString('tr-TR')} km`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Rozetler ── */}
        <View style={[st.card, PREMIUM_SHADOW.soft]}>
          <Text style={st.sectionTitle}>Rozetlerim</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
            {BADGES.map((b) => {
              const earned = earnedBadges.includes(b.code);
              const tier = TIER_COLORS[b.tier];
              return (
                <View key={b.code} style={[st.badge, { backgroundColor: earned ? tier.bg : T.surfaceRaised, opacity: earned ? 1 : 0.55 }]}>
                  <Text style={[st.badgeIcon, !earned && { opacity: 0.5 }]}>{earned ? b.icon : '🔒'}</Text>
                  <Text style={[st.badgeName, { color: earned ? tier.color : T.textMuted }]} numberOfLines={1}>{b.name}</Text>
                  <Text style={st.badgeKm}>{b.kmThreshold.toLocaleString('tr-TR')} km</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Kuponlar ── */}
        {coupons.length > 0 && (
          <View style={[st.card, PREMIUM_SHADOW.soft]}>
            <Text style={st.sectionTitle}>Kazandığım Kuponlar</Text>
            {coupons.map((uc) => {
              const def = COUPONS.find((c) => c.code === uc.coupon_code);
              return (
                <View key={uc.id} style={[st.coupon, uc.is_used && { opacity: 0.5 }]}>
                  <View style={st.couponLeft}>
                    <Text style={st.couponDiscount}>{def?.discount ?? '%'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.couponTitle}>{def?.title ?? uc.coupon_code}</Text>
                    <Text style={st.couponMeta}>
                      {uc.is_used ? 'Kullanıldı' : uc.expires_at ? `Son: ${new Date(uc.expires_at).toLocaleDateString('tr-TR')}` : 'Aktif'}
                    </Text>
                  </View>
                  <Text style={st.couponTag}>{uc.is_used ? '' : 'AKTİF'}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Liderlik Tablosu ── */}
        <View style={[st.card, PREMIUM_SHADOW.soft]}>
          <View style={st.sectionHead}>
            <Text style={st.sectionTitle}>Haftalık Liderlik</Text>
            <Text style={st.sectionHint}>Bu hafta</Text>
          </View>
          {leaderboard.length === 0 ? (
            <Text style={st.emptyTxt}>Bu hafta henüz sürüş verisi yok. İlk sırayı sen kap! 🏁</Text>
          ) : (
            leaderboard.map((row) => (
              <View key={row.user_id} style={[st.lbRow, row.is_me && st.lbRowMe]}>
                <Text style={[st.lbRank, row.rank <= 3 && st.lbRankTop]}>
                  {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank}
                </Text>
                <Text style={[st.lbName, row.is_me && { fontWeight: '800', color: T.primary }]} numberOfLines={1}>
                  {row.is_me ? 'Sen' : row.full_name}
                </Text>
                <Text style={st.lbKm}>{Number(row.week_km).toLocaleString('tr-TR')} km</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

// ── Alt bileşenler ──────────────────────────────────────────
function ProgressRing({ progress }: { progress: number }) {
  const size = 92, stroke = 8, r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r} stroke="#FBB040" strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <Circle cx={size / 2} cy={size / 2} r={r - 18} fill="rgba(255,255,255,0.06)" />
    </Svg>
  );
}

function ProgressBar({ progress, warn }: { progress: number; warn?: boolean }) {
  return (
    <View style={st.progressTrack}>
      <View style={[st.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: warn ? COLORS.warning : COLORS.success }]} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  center: { flex: 1, backgroundColor: T.background, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingTop: Platform.OS === 'ios' ? 56 : 42, paddingHorizontal: 20, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  heroBack: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  heroStats: { color: '#FBB040', fontSize: 14, fontWeight: '700' },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14 },
  ringRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  totalKm: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  kmUnit: { fontSize: 20, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  totalKmSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  nextBadgePill: { alignSelf: 'flex-start', backgroundColor: 'rgba(251,176,64,0.18)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10 },
  nextBadgePillTxt: { color: '#FBB040', fontSize: 12, fontWeight: '600' },
  heroStatsRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingVertical: 14 },
  heroStatBox: { flex: 1, alignItems: 'center' },
  heroStatVal: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroStatLbl: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  body: { padding: 16, marginTop: 4 },
  card: { backgroundColor: T.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: T.border },
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: T.textMuted },
  trackRow: { flexDirection: 'row', alignItems: 'center' },
  vehicleChoices: { marginTop: 16, gap: 8 },
  vehicleChoice: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceRaised },
  vehicleChoiceSelected: { borderColor: T.primary },
  vehicleChoiceTitle: { color: T.text, fontSize: 13, fontWeight: '700' },
  liveMileage: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: '#21150A' },
  trackTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  trackSub: { fontSize: 12, color: T.textMuted, marginTop: 3, lineHeight: 17, paddingRight: 10 },
  simBtn: { marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingVertical: 11, alignItems: 'center', backgroundColor: T.surfaceRaised },
  simBtnTxt: { fontSize: 13, fontWeight: '600', color: T.textSoft },
  fuelRow: { flexDirection: 'row', backgroundColor: '#19130D', borderRadius: 14, paddingVertical: 14, marginTop: 4, borderWidth: 1, borderColor: T.borderWarm },
  fuelBox: { flex: 1, alignItems: 'center' },
  fuelVal: { fontSize: 17, fontWeight: '800', color: T.text },
  fuelLbl: { fontSize: 11, color: T.textMuted, marginTop: 3 },
  fuelDivider: { width: 1, backgroundColor: T.borderWarm },
  fuelNote: { fontSize: 11, color: T.textMuted, marginTop: 10, lineHeight: 16 },
  monthFuelRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.borderWarm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthFuelLabel: { fontSize: 10, fontWeight: '800', color: T.primary, letterSpacing: 0.8 },
  monthFuelMeta: { fontSize: 11, color: T.textMuted, marginTop: 3 },
  monthFuelCost: { fontSize: 19, fontWeight: '900', color: T.primary },
  consumptionRow: { marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: T.borderWarm, flexDirection: 'row', alignItems: 'center', gap: 7 },
  consumptionLabel: { fontSize: 9, fontWeight: '900', color: T.primary, letterSpacing: 0.45 },
  consumptionHelp: { fontSize: 9, color: T.textMuted, marginTop: 3 },
  consumptionInput: { width: 66, minHeight: 44, paddingVertical: 8, borderWidth: 1, borderColor: T.borderWarm, borderRadius: 9, backgroundColor: T.surfaceRaised, textAlign: 'center', color: T.text, fontWeight: '800' },
  consumptionSave: { minHeight: 44, paddingVertical: 8, borderRadius: 9, backgroundColor: T.primary, justifyContent: 'center', paddingHorizontal: 10 },
  consumptionSaveText: { color: '#111827', fontSize: 10, fontWeight: '900' },
  warnPill: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  warnPillTxt: { fontSize: 11, fontWeight: '700', color: '#D97706' },
  maintRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  maintIcon: { fontSize: 30, marginRight: 14 },
  maintName: { fontSize: 15, fontWeight: '700', color: T.text },
  maintRemain: { fontSize: 13, color: T.textMuted, marginTop: 2 },
  maintArrow: { fontSize: 24, color: T.textMuted },
  maintCta: { fontSize: 12, color: T.primary, fontWeight: '600', marginTop: 10 },
  maintMiniRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border },
  maintMiniIcon: { fontSize: 18, marginRight: 10 },
  maintMiniName: { flex: 1, fontSize: 14, color: T.textSoft },
  maintMiniKm: { fontSize: 13, fontWeight: '700', color: T.text },
  badge: { width: 104, borderRadius: 16, padding: 12, marginRight: 10, alignItems: 'center' },
  badgeIcon: { fontSize: 30, marginBottom: 6 },
  badgeName: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  badgeKm: { fontSize: 10, color: T.textMuted, marginTop: 2 },
  coupon: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.surfaceRaised, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: T.border },
  couponLeft: { width: 54, height: 54, borderRadius: 12, backgroundColor: T.surfaceSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  couponDiscount: { color: '#FBB040', fontSize: 16, fontWeight: '800' },
  couponTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  couponMeta: { fontSize: 12, color: T.textMuted, marginTop: 2 },
  couponTag: { fontSize: 11, fontWeight: '800', color: COLORS.success, letterSpacing: 0.5 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.border },
  lbRowMe: { backgroundColor: '#21150A', borderRadius: 12, paddingHorizontal: 10, marginHorizontal: -6, borderBottomColor: 'transparent' },
  lbRank: { width: 34, fontSize: 15, fontWeight: '700', color: T.textMuted, textAlign: 'center' },
  lbRankTop: { fontSize: 18 },
  lbName: { flex: 1, fontSize: 15, color: T.textSoft, marginLeft: 6 },
  lbKm: { fontSize: 14, fontWeight: '700', color: T.text },
  emptyTxt: { fontSize: 13, color: T.textMuted, paddingVertical: 12, textAlign: 'center', lineHeight: 19 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: T.surfaceSoft, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
