import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { router, useLocalSearchParams } from 'expo-router';
import { MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import { PREMIUM_SHADOW } from '../../lib/gradients';
import { getMonthlyStats, MonthlyStats } from '../../lib/driving/api';
import { getMonthFuelSummary, FuelVehicle, FuelEstimate } from '../../lib/driving/fuel';
import { supabase } from '../../lib/supabase';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const CHART_H = 180;

export default function DrivingStatsScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [vehicle, setVehicle] = useState<FuelVehicle | null>(null);
  const [est, setEstimate] = useState<FuelEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setError(null); setStats(null); setEstimate(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error('İstatistikleri görmek için yeniden giriş yapın.');
      let query = supabase.from('vehicles').select('id,brand,model,year,fuel_type,engine').eq('user_id', auth.user.id);
      if (vehicleId) query = query.eq('id', vehicleId);
      const { data: car, error: vehicleError } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (vehicleError) throw vehicleError;
      if (!car) throw new Error('İstatistikleri görmek için kayıtlı bir araç seçin.');
      const { data: preference, error: preferenceError } = await supabase.from('vehicle_fuel_preferences')
        .select('custom_consumption_per_100').eq('user_id', auth.user.id).eq('vehicle_id', car.id).maybeSingle();
      if (preferenceError) throw preferenceError;
      const selected = { id: car.id, brand: car.brand, model: car.model, year: car.year, fuelType: car.fuel_type, engine: car.engine, customConsumption: Number(preference?.custom_consumption_per_100) || null };
      const [summary, estimate] = await Promise.all([
        getMonthlyStats(year, month, car.id),
        getMonthFuelSummary(selected, year, month).catch(() => null),
      ]);
      if (version !== loadVersion.current) return;
      setVehicle(selected); setStats(summary); setEstimate(estimate);
    } catch (err: any) {
      if (version === loadVersion.current) setError(err?.message || 'Sürüş kayıtları alınamadı. Bağlantınızı kontrol edip yeniden deneyin.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [year, month, vehicleId]);

  useEffect(() => { void load(); return () => { loadVersion.current += 1; }; }, [load]);

  const changeMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    // gelecek ayları engelle
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) return;
    setMonth(m); setYear(y);
  };

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const maxKm = stats ? Math.max(1, ...stats.perDay.map((d) => d.km)) : 1;

  // Haftalık gruplama (özet çubukları)
  const weeks = stats ? groupByWeek(stats.perDay) : [];

  return (
    <ScrollView style={st.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Geri" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={st.back}>← Geri</Text></TouchableOpacity>
        <Text style={st.title}>Sürüş İstatistikleri</Text>
      </View>

      {vehicle?.id && <Text style={{ paddingHorizontal: 20, marginBottom: 12, color: T.textMuted }}>{vehicle.brand} {vehicle.model} · {vehicle.year}</Text>}
      {/* Ay seçici */}
      <View style={st.monthNav}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Önceki ay" onPress={() => changeMonth(-1)} style={st.monthBtn}><Text style={st.monthBtnTxt}>‹</Text></TouchableOpacity>
        <Text style={st.monthLabel}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sonraki ay" onPress={() => changeMonth(1)} style={[st.monthBtn, isCurrentMonth && st.monthBtnDisabled]} disabled={isCurrentMonth}>
          <Text style={[st.monthBtnTxt, isCurrentMonth && { color: T.textMuted }]}>›</Text>
        </TouchableOpacity>
      </View>

      {error && <View style={{ padding: 20 }}><Text style={{ color: T.primary }} accessibilityRole="alert">{error}</Text><TouchableOpacity onPress={load} accessibilityRole="button" style={{ paddingVertical: 16 }}><Text style={{ color: T.primary }}>Yeniden dene</Text></TouchableOpacity></View>}
      {loading ? (
        <View style={{ paddingVertical: 60 }}><ActivityIndicator color={T.primary} /></View>
      ) : stats ? (
        <View style={{ paddingHorizontal: 20 }}>
          {/* Özet kartları */}
          <View style={st.summaryRow}>
            <SummaryCard label="Toplam" value={`${stats.monthKm.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`} unit="km" />
            <SummaryCard label="Sürüş" value={`${stats.monthDrives}`} unit="kez" />
            <SummaryCard label="Ortalama" value={`${stats.avgKmPerDrive.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`} unit="km" />
          </View>

          {/* Aylık yakıt masrafı */}
          {vehicle && est && est.km > 0 && (() => {
            return (
              <View style={[st.card, PREMIUM_SHADOW.soft]}>
                <Text style={st.cardTitle}>⛽️ Tahmini Yakıt Masrafı</Text>
                <View style={st.fuelRow}>
                  <Text style={st.fuelCost}>{est.cost === null ? (est.consumptionSource === 'unavailable' ? 'Yakıt türünü tamamlayın' : 'Güncel fiyat alınamadı') : `~${Math.round(est.cost).toLocaleString('tr-TR')} ₺`}</Text>
                  <Text style={st.fuelMeta}>
                    {est.amount?.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {est.unit} · {est.fuelLabel}
                    {vehicle.brand ? ` · ${vehicle.brand} ${vehicle.model ?? ''}` : ''}
                  </Text>
                </View>
                <Text style={st.fuelNote}>
                  {est.consumptionSource === 'unavailable' ? 'Masraf hesabı için Araçlarım bölümünde yakıt türünü tamamlayın.' : <>{est.consumptionPer100?.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {est.unit}/100 km tüketim varsayımıyla, bu aracın {est.km.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km sürüşü için hesaplanır. {est.priceSource ? `${est.priceSource}. Son alınan fiyatla tahmindir; geçmiş ayın gerçekleşmiş gideri değildir.` : 'Fiyat kaynağına ulaşılamadı.'}</>}
                </Text>
              </View>
            );
          })()}

          {/* Günlük çubuk grafik */}
          <View style={[st.card, PREMIUM_SHADOW.soft]}>
            <Text style={st.cardTitle}>Günlük Dağılım</Text>
            {stats.monthKm === 0 ? (
              <Text style={st.emptyTxt}>Bu ay için sürüş verisi bulunmuyor.</Text>
            ) : (
              <DailyChart perDay={stats.perDay} maxKm={maxKm} />
            )}
          </View>

          {/* Haftalık özet */}
          {stats.monthKm > 0 && (
            <View style={[st.card, PREMIUM_SHADOW.soft]}>
              <Text style={st.cardTitle}>Haftalık Özet</Text>
              {weeks.map((w, i) => {
                const wMax = Math.max(1, ...weeks.map((x) => x.km));
                return (
                  <View key={i} style={st.weekRow}>
                    <Text style={st.weekLabel}>{i + 1}. Hafta</Text>
                    <View style={st.weekTrack}>
                      <View style={[st.weekFill, { width: `${Math.round((w.km / wMax) * 100)}%` }]} />
                    </View>
                    <Text style={st.weekKm}>{Math.round(w.km).toLocaleString('tr-TR')} km</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

function SummaryCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={[st.summaryCard, PREMIUM_SHADOW.soft]}>
      <Text style={st.summaryValue}>{value}<Text style={st.summaryUnit}> {unit}</Text></Text>
      <Text style={st.summaryLabel}>{label}</Text>
    </View>
  );
}

function DailyChart({ perDay, maxKm }: { perDay: { day: number; km: number }[]; maxKm: number }) {
  const [chartWidth, setChartWidth] = useState(0);
  const n = perDay.length;
  const gap = 2;
  const barW = (chartWidth - gap * (n - 1)) / n;
  return (
    <View style={{ marginTop: 8, minHeight: CHART_H + 22 }} onLayout={event => setChartWidth(event.nativeEvent.layout.width)}>
      {chartWidth > 0 && <Svg width={chartWidth} height={CHART_H + 22}>
        {/* Yatay ızgara çizgileri */}
        {[0.25, 0.5, 0.75, 1].map((f, i) => (
          <Line key={i} x1={0} y1={CHART_H * (1 - f)} x2={chartWidth} y2={CHART_H * (1 - f)} stroke={T.border} strokeWidth={1} />
        ))}
        {perDay.map((d, i) => {
          const h = d.km > 0 ? Math.max(3, (d.km / maxKm) * CHART_H) : 0;
          const x = i * (barW + gap);
          return (
            <Rect
              key={d.day}
              x={x} y={CHART_H - h} width={barW} height={h} rx={Math.min(3, barW / 2)}
              fill={d.km > 0 ? T.primary : T.border}
            />
          );
        })}
        {/* Gün etiketleri (her 5 günde bir) */}
        {perDay.map((d, i) => (
          (d.day === 1 || d.day % 5 === 0) ? (
            <SvgText key={`t${d.day}`} x={i * (barW + gap) + barW / 2} y={CHART_H + 16} fontSize={9} fill={T.textMuted} textAnchor="middle">{d.day}</SvgText>
          ) : null
        ))}
      </Svg>}
    </View>
  );
}

function groupByWeek(perDay: { day: number; km: number }[]): { km: number }[] {
  const weeks: { km: number }[] = [];
  perDay.forEach((d) => {
    const w = Math.floor((d.day - 1) / 7);
    if (!weeks[w]) weeks[w] = { km: 0 };
    weeks[w].km += d.km;
  });
  return weeks;
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  header: { paddingTop: Platform.OS === 'ios' ? 56 : 42, paddingHorizontal: 20, paddingBottom: 8 },
  back: { fontSize: 15, color: T.textSoft, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: T.text },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 12 },
  monthBtn: { width: 44, height: 44, borderRadius: 20, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', ...PREMIUM_SHADOW.soft },
  monthBtnDisabled: { opacity: 0.5 },
  monthBtnTxt: { fontSize: 22, color: T.primary, fontWeight: '700', marginTop: -2 },
  monthLabel: { fontSize: 17, fontWeight: '800', color: T.text, minWidth: 140, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: T.surface, borderRadius: 16, padding: 14, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '800', color: T.primary },
  summaryUnit: { fontSize: 12, fontWeight: '600', color: T.textMuted },
  summaryLabel: { fontSize: 12, color: T.textSoft, marginTop: 4 },
  card: { backgroundColor: T.surface, borderRadius: 18, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 8 },
  emptyTxt: { fontSize: 13, color: T.textMuted, paddingVertical: 24, textAlign: 'center' },
  weekRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  weekLabel: { width: 70, fontSize: 13, color: T.textSoft },
  weekTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: T.border, overflow: 'hidden', marginHorizontal: 10 },
  weekFill: { height: 10, borderRadius: 5, backgroundColor: T.primary },
  weekKm: { width: 70, fontSize: 13, fontWeight: '700', color: T.text, textAlign: 'right' },
  fuelRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  fuelCost: { fontSize: 24, fontWeight: '800', color: T.primary },
  fuelMeta: { fontSize: 13, color: T.textSoft },
  fuelNote: { fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 16 },
});
