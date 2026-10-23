import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Platform, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../../lib/constants';

const NAV_BLUE = '#001E52';

function IconBack({ size = 22, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

interface HistoryItem {
  id: string;
  type: 'request' | 'review';
  title: string;
  subtitle: string;
  date: Date;
  status?: string;
  rating?: number;
  vehicle?: string;
  mechanic?: string;
  price?: string;
  category?: string;
}

export default function ServiceHistoryScreen() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Toplam istatistikler
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalServices, setTotalServices] = useState(0);
  const [avgRating, setAvgRating] = useState(0);

  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const historyItems: HistoryItem[] = [];

      // Tamamlanan talepler
      const { data: requests } = await supabase
        .from('damage_requests')
        .select('id, title, description, status, created_at, damage_area, recommended_specialty, vehicles(brand,model,year)')
        .eq('user_id', user.id)
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false });

      if (requests) {
        requests.forEach(req => {
          const veh = req.vehicles as any;
          historyItems.push({
            id: `req-${req.id}`,
            type: 'request',
            title: req.title,
            subtitle: req.description?.substring(0, 80) || '',
            date: new Date(req.created_at),
            status: req.status,
            vehicle: veh ? `${veh.brand} ${veh.model} ${veh.year}` : undefined,
            category: req.recommended_specialty || req.damage_area || undefined,
          });
        });
      }

      // Değerlendirmeler
      const { data: reviews } = await supabase
        .from('reviews')
        .select('id, rating, comment, service_category, total_paid, created_at, mechanic_profiles:profile_directory!reviews_mechanic_id_fkey(full_name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (reviews) {
        let totalP = 0;
        let ratingSum = 0;
        reviews.forEach(rev => {
          const mech = rev.mechanic_profiles as any;
          historyItems.push({
            id: `rev-${rev.id}`,
            type: 'review',
            title: rev.service_category || 'Değerlendirme',
            subtitle: rev.comment || 'Yorum yapılmadı',
            date: new Date(rev.created_at),
            rating: rev.rating,
            mechanic: mech?.full_name,
            price: rev.total_paid ? `₺${rev.total_paid}` : undefined,
            category: rev.service_category || undefined,
          });
          if (rev.total_paid) totalP += rev.total_paid;
          ratingSum += rev.rating;
        });
        setTotalSpent(totalP);
        setAvgRating(reviews.length > 0 ? ratingSum / reviews.length : 0);
      }

      historyItems.sort((a, b) => b.date.getTime() - a.date.getTime());
      setItems(historyItems);
      setTotalServices(historyItems.length);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const onRefresh = () => { setRefreshing(true); fetchHistory(); };

  // Tarihe göre gruplama
  const groupByMonth = (items: HistoryItem[]) => {
    const groups: Record<string, HistoryItem[]> = {};
    items.forEach(item => {
      const key = `${MONTHS[item.date.getMonth()]} ${item.date.getFullYear()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  };

  if (loading) return (
    <View style={s.center}><ActivityIndicator color={NAV_BLUE} size="large" /></View>
  );

  const grouped = groupByMonth(items);

  return (
    <View style={s.root}>
      {/* Header */}
      <LinearGradient colors={['#080E1A', '#0F2749']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <IconBack size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={s.headerSub}>SanayiX</Text>
          <Text style={s.headerTitle}>Servis Geçmişi</Text>
        </View>
        <View style={{ width: 36 }} />
      </LinearGradient>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeAnim }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAV_BLUE} />}
      >
        {/* İstatistik kartları */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statEmoji}>🔧</Text>
            <Text style={s.statValue}>{totalServices}</Text>
            <Text style={s.statLabel}>Toplam İşlem</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statEmoji}>💰</Text>
            <Text style={s.statValue}>{totalSpent > 0 ? `₺${totalSpent.toLocaleString('tr-TR')}` : '—'}</Text>
            <Text style={s.statLabel}>Toplam Harcama</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statEmoji}>⭐</Text>
            <Text style={s.statValue}>{avgRating > 0 ? avgRating.toFixed(1) : '—'}</Text>
            <Text style={s.statLabel}>Ort. Puan</Text>
          </View>
        </View>

        {items.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>📜</Text>
            <Text style={s.emptyTitle}>Henüz Geçmiş Yok</Text>
            <Text style={s.emptySub}>Tamamlanan işlemleriniz burada görünecek.</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([month, monthItems]) => (
            <View key={month}>
              <Text style={s.monthLabel}>{month}</Text>
              {monthItems.map(item => (
                <View key={item.id} style={s.historyCard}>
                  <View style={s.historyLeft}>
                    <View style={[s.historyIcon, {
                      backgroundColor: item.type === 'review' ? '#FEF3C7' : item.status === 'completed' ? '#D1FAE5' : '#FEE2E2',
                    }]}>
                      <Text style={{ fontSize: 18 }}>
                        {item.type === 'review' ? '⭐' : item.status === 'completed' ? '✅' : '❌'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={s.historyTitleRow}>
                      <Text style={s.historyTitle} numberOfLines={1}>{item.title}</Text>
                      {item.rating && (
                        <View style={s.ratingBadge}>
                          <Text style={s.ratingText}>★ {item.rating}</Text>
                        </View>
                      )}
                    </View>

                    {item.mechanic && <Text style={s.historyMechanic}>{item.mechanic}</Text>}
                    {item.vehicle && <Text style={s.historyVehicle}>🚗 {item.vehicle}</Text>}
                    <Text style={s.historyDesc} numberOfLines={1}>{item.subtitle}</Text>

                    <View style={s.historyFooter}>
                      {item.category && (
                        <View style={s.catPill}>
                          <Text style={s.catPillText}>{item.category}</Text>
                        </View>
                      )}
                      {item.price && <Text style={s.historyPrice}>{item.price}</Text>}
                      <Text style={s.historyDate}>
                        {item.date.toLocaleDateString('tr-TR')}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F5' },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontFamily: FONTS.medium, fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  headerTitle: { fontFamily: FONTS.extrabold, fontSize: 22, color: '#fff' },

  content: { padding: SPACING.lg },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', ...SHADOW.card,
  },
  statEmoji: { fontSize: 24, marginBottom: 6 },
  statValue: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#1E293B', marginBottom: 3 },
  statLabel: { fontFamily: FONTS.medium, fontSize: 10, color: '#94A3B8' },

  // Empty
  emptyBox: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontFamily: FONTS.extrabold, fontSize: 22, color: '#1E293B', marginBottom: 6 },
  emptySub: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', textAlign: 'center' },

  // Month
  monthLabel: {
    fontFamily: FONTS.semibold, fontSize: 13, color: '#94A3B8',
    letterSpacing: 0.8, marginBottom: SPACING.sm, marginTop: SPACING.sm,
  },

  // History Card
  historyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: SPACING.md,
    flexDirection: 'row', gap: SPACING.md, marginBottom: 10, ...SHADOW.card,
  },
  historyLeft: {},
  historyIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  historyTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  historyTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: '#1E293B', flex: 1 },
  historyMechanic: { fontFamily: FONTS.medium, fontSize: 12, color: '#2563EB', marginBottom: 2 },
  historyVehicle: { fontFamily: FONTS.regular, fontSize: 11, color: '#64748B', marginBottom: 3 },
  historyDesc: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8', marginBottom: 6 },
  ratingBadge: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  ratingText: { fontFamily: FONTS.semibold, fontSize: 12, color: '#D97706' },
  historyFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catPill: { backgroundColor: '#F0F4FF', borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  catPillText: { fontFamily: FONTS.medium, fontSize: 10, color: '#2563EB' },
  historyPrice: { fontFamily: FONTS.extrabold, fontSize: 13, color: '#059669' },
  historyDate: { fontFamily: FONTS.regular, fontSize: 11, color: '#CBD5E1', marginLeft: 'auto' },
});
