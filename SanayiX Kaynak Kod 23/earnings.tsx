import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Platform, RefreshControl, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Circle, Polyline, Rect } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../../lib/constants';

const NAVY = '#0F2167';
const AMBER = '#E07B00';
const SW = Dimensions.get('window').width;

function IconBack({ size = 22, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS_FULL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

interface EarningItem {
  id: string;
  title: string;
  price: number;
  date: Date;
  status: string;
  vehicle?: string;
}

export default function EarningsScreen() {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'all' | 'month' | 'week'>('all');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { fetchEarnings(); }, []);

  const fetchEarnings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('offers')
        .select('id, price, status, completed_at, created_at, damage_requests(title, vehicles(brand,model))')
        .eq('mechanic_id', user.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });

      if (data) setOffers(data);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const onRefresh = () => { setRefreshing(true); fetchEarnings(); };

  // Filter by period
  const now = Date.now();
  const filteredOffers = offers.filter(o => {
    if (period === 'all') return true;
    const d = new Date(o.completed_at || o.created_at).getTime();
    if (period === 'week') return now - d < 7 * 24 * 60 * 60 * 1000;
    if (period === 'month') return now - d < 30 * 24 * 60 * 60 * 1000;
    return true;
  });

  const totalEarnings = filteredOffers.reduce((s, o) => s + (o.price || 0), 0);
  const completedOffers = filteredOffers.filter(o => o.completed_at);
  const pendingOffers = filteredOffers.filter(o => !o.completed_at);
  const completedTotal = completedOffers.reduce((s, o) => s + (o.price || 0), 0);
  const pendingTotal = pendingOffers.reduce((s, o) => s + (o.price || 0), 0);
  const avgPerJob = completedOffers.length > 0 ? completedTotal / completedOffers.length : 0;

  // Monthly chart data (last 6 months)
  const monthlyData: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const m = d.getMonth();
    const y = d.getFullYear();
    const monthTotal = offers
      .filter(o => {
        const od = new Date(o.completed_at || o.created_at);
        return od.getMonth() === m && od.getFullYear() === y;
      })
      .reduce((s, o) => s + (o.price || 0), 0);
    monthlyData.push({ label: MONTHS[m], value: monthTotal });
  }
  const maxMonthly = Math.max(...monthlyData.map(m => m.value), 1);

  if (loading) return (
    <View style={s.center}><ActivityIndicator color={NAVY} size="large" /></View>
  );

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <IconBack size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={s.headerSub}>SanayiX Usta</Text>
          <Text style={s.headerTitle}>Kazançlarım</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeAnim }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
      >
        {/* Total Earnings Card */}
        <View style={s.totalCard}>
          <View style={s.totalBg}>
            <Text style={{ fontSize: 80, position: 'absolute', right: -10, bottom: -10, opacity: 0.08 }}>💰</Text>
          </View>
          <Text style={s.totalLabel}>Toplam Kazanç</Text>
          <Text style={s.totalValue}>₺{totalEarnings.toLocaleString('tr-TR')}</Text>
          <View style={s.periodRow}>
            {(['all', 'month', 'week'] as const).map(p => (
              <TouchableOpacity key={p}
                style={[s.periodBtn, period === p && s.periodBtnActive]}
                onPress={() => setPeriod(p)} activeOpacity={0.8}>
                <Text style={[s.periodText, period === p && s.periodTextActive]}>
                  {p === 'all' ? 'Tümü' : p === 'month' ? 'Bu Ay' : 'Bu Hafta'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={{ fontSize: 22 }}>✅</Text>
            <Text style={s.statValue}>₺{completedTotal.toLocaleString('tr-TR')}</Text>
            <Text style={s.statLabel}>Tamamlanan</Text>
            <Text style={s.statCount}>{completedOffers.length} iş</Text>
          </View>
          <View style={s.statCard}>
            <Text style={{ fontSize: 22 }}>⏳</Text>
            <Text style={s.statValue}>₺{pendingTotal.toLocaleString('tr-TR')}</Text>
            <Text style={s.statLabel}>Devam Eden</Text>
            <Text style={s.statCount}>{pendingOffers.length} iş</Text>
          </View>
          <View style={s.statCard}>
            <Text style={{ fontSize: 22 }}>📊</Text>
            <Text style={s.statValue}>₺{avgPerJob > 0 ? Math.round(avgPerJob).toLocaleString('tr-TR') : '—'}</Text>
            <Text style={s.statLabel}>Ort. İş Başı</Text>
          </View>
        </View>

        {/* Monthly Chart */}
        <View style={s.chartCard}>
          <Text style={s.chartTitle}>Aylık Kazanç Grafiği</Text>
          <View style={s.chartWrap}>
            {monthlyData.map((m, i) => (
              <View key={i} style={s.chartCol}>
                <Text style={s.chartBarValue}>
                  {m.value > 0 ? `₺${(m.value / 1000).toFixed(0)}K` : ''}
                </Text>
                <View style={s.chartBarBg}>
                  <Animated.View style={[s.chartBar, {
                    height: `${(m.value / maxMonthly) * 100}%`,
                    backgroundColor: i === monthlyData.length - 1 ? AMBER : NAVY,
                  }]} />
                </View>
                <Text style={s.chartLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Transaction List */}
        <Text style={s.sectionTitle}>Son İşlemler</Text>
        {filteredOffers.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>💼</Text>
            <Text style={s.emptyTitle}>Henüz kazanç yok</Text>
            <Text style={s.emptySub}>Kabul edilen teklifleriniz burada görünecek.</Text>
          </View>
        ) : (
          filteredOffers.map(offer => {
            const req = offer.damage_requests;
            const veh = req?.vehicles;
            const isCompleted = !!offer.completed_at;
            const date = new Date(offer.completed_at || offer.created_at);

            return (
              <View key={offer.id} style={s.txCard}>
                <View style={[s.txIcon, { backgroundColor: isCompleted ? '#D1FAE5' : '#FEF3C7' }]}>
                  <Text style={{ fontSize: 18 }}>{isCompleted ? '✅' : '⏳'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.txTitle} numberOfLines={1}>{req?.title || 'İş'}</Text>
                  {veh && <Text style={s.txSub}>{veh.brand} {veh.model}</Text>}
                  <Text style={s.txDate}>
                    {date.toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.txAmount, { color: isCompleted ? '#059669' : '#D97706' }]}>
                    +₺{Number(offer.price || 0).toLocaleString('tr-TR')}
                  </Text>
                  <Text style={s.txStatus}>{isCompleted ? 'Tamamlandı' : 'Devam Ediyor'}</Text>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F2F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F8' },

  header: {
    backgroundColor: NAVY, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontFamily: FONTS.medium, fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  headerTitle: { fontFamily: FONTS.extrabold, fontSize: 22, color: '#fff' },

  content: { padding: SPACING.lg },

  // Total Card
  totalCard: {
    backgroundColor: NAVY, borderRadius: 22, padding: SPACING.lg,
    marginBottom: SPACING.md, overflow: 'hidden',
    shadowColor: NAVY, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  totalBg: { position: 'absolute', right: 0, bottom: 0, width: 100, height: 100 },
  totalLabel: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  totalValue: { fontFamily: FONTS.extrabold, fontSize: 42, color: '#fff', marginBottom: 12 },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  periodBtnActive: { backgroundColor: AMBER },
  periodText: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  periodTextActive: { color: '#fff', fontFamily: FONTS.semibold },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14,
    alignItems: 'center', ...SHADOW.card,
  },
  statValue: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#1E293B', marginTop: 4, marginBottom: 2 },
  statLabel: { fontFamily: FONTS.medium, fontSize: 10, color: '#94A3B8' },
  statCount: { fontFamily: FONTS.regular, fontSize: 10, color: '#CBD5E1', marginTop: 2 },

  // Chart
  chartCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: SPACING.lg,
    marginBottom: SPACING.lg, ...SHADOW.card,
  },
  chartTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: '#1E293B', marginBottom: SPACING.md },
  chartWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140 },
  chartCol: { flex: 1, alignItems: 'center' },
  chartBarValue: { fontFamily: FONTS.medium, fontSize: 9, color: '#94A3B8', marginBottom: 4 },
  chartBarBg: { width: 24, height: 100, backgroundColor: '#F1F5F9', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  chartBar: { width: '100%', borderRadius: 6 },
  chartLabel: { fontFamily: FONTS.medium, fontSize: 11, color: '#64748B', marginTop: 6 },

  // Section
  sectionTitle: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#1E293B', marginBottom: SPACING.md },

  // Empty
  emptyBox: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#1E293B', marginBottom: 6 },
  emptySub: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', textAlign: 'center' },

  // Transaction Card
  txCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginBottom: 10, ...SHADOW.card,
  },
  txIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  txTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: '#1E293B', marginBottom: 2 },
  txSub: { fontFamily: FONTS.regular, fontSize: 11, color: '#94A3B8' },
  txDate: { fontFamily: FONTS.regular, fontSize: 10, color: '#CBD5E1', marginTop: 2 },
  txAmount: { fontFamily: FONTS.extrabold, fontSize: 16, marginBottom: 2 },
  txStatus: { fontFamily: FONTS.regular, fontSize: 10, color: '#94A3B8' },
});
