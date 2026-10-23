import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Platform, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../../lib/constants';

const NAVY = '#0F2167';
const AMBER = '#E07B00';

function IconBack({ size = 22, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const RATING_LABELS = ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel'];
const RATING_EMOJIS = ['', '😞', '😕', '😐', '😊', '🤩'];

export default function MechanicReviewsScreen() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avgRating, setAvgRating] = useState(0);
  const [ratingDist, setRatingDist] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { fetchReviews(); }, []);

  const fetchReviews = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('reviews')
        .select('*, profiles:profile_directory!user_id(full_name)')
        .eq('mechanic_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        setReviews(data);
        // Calculate stats
        const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let sum = 0;
        data.forEach(r => {
          dist[r.rating] = (dist[r.rating] || 0) + 1;
          sum += r.rating;
        });
        setRatingDist(dist);
        setAvgRating(data.length > 0 ? sum / data.length : 0);
      }
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const onRefresh = () => { setRefreshing(true); fetchReviews(); };

  if (loading) return (
    <View style={s.center}><ActivityIndicator color={NAVY} size="large" /></View>
  );

  const maxDist = Math.max(...Object.values(ratingDist), 1);

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <IconBack size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={s.headerSub}>SanayiX Usta</Text>
          <Text style={s.headerTitle}>Değerlendirmelerim</Text>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countText}>{reviews.length}</Text>
        </View>
      </View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeAnim }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
      >
        {/* Summary Card */}
        <View style={s.summaryCard}>
          <View style={s.summaryLeft}>
            <Text style={s.bigRating}>{avgRating > 0 ? avgRating.toFixed(1) : '—'}</Text>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <Text key={star} style={{ fontSize: 20, color: avgRating >= star ? '#F59E0B' : '#E5E7EB' }}>★</Text>
              ))}
            </View>
            <Text style={s.totalReviews}>{reviews.length} değerlendirme</Text>
          </View>

          <View style={s.summaryRight}>
            {[5, 4, 3, 2, 1].map(star => (
              <View key={star} style={s.distRow}>
                <Text style={s.distLabel}>{star}</Text>
                <View style={s.distBarBg}>
                  <Animated.View style={[s.distBar, {
                    width: `${(ratingDist[star] / maxDist) * 100}%`,
                    backgroundColor: star >= 4 ? '#10B981' : star === 3 ? '#F59E0B' : '#EF4444',
                  }]} />
                </View>
                <Text style={s.distCount}>{ratingDist[star]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Pozitif / Negatif özet */}
        {reviews.length > 0 && (
          <View style={s.insightsRow}>
            <View style={[s.insightCard, { borderLeftColor: '#10B981' }]}>
              <Text style={{ fontSize: 20 }}>👍</Text>
              <Text style={s.insightValue}>
                {reviews.filter(r => r.price_fair === true).length}
              </Text>
              <Text style={s.insightLabel}>Fiyat Adil</Text>
            </View>
            <View style={[s.insightCard, { borderLeftColor: '#2563EB' }]}>
              <Text style={{ fontSize: 20 }}>⏰</Text>
              <Text style={s.insightValue}>
                {reviews.filter(r => r.on_time === true).length}
              </Text>
              <Text style={s.insightLabel}>Zamanında</Text>
            </View>
            <View style={[s.insightCard, { borderLeftColor: '#7C3AED' }]}>
              <Text style={{ fontSize: 20 }}>🔄</Text>
              <Text style={s.insightValue}>
                {reviews.filter(r => r.would_return === true).length}
              </Text>
              <Text style={s.insightLabel}>Tekrar Gelir</Text>
            </View>
          </View>
        )}

        {/* Reviews List */}
        <Text style={s.sectionTitle}>Son Değerlendirmeler</Text>

        {reviews.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 56, marginBottom: 12 }}>⭐</Text>
            <Text style={s.emptyTitle}>Henüz Değerlendirme Yok</Text>
            <Text style={s.emptySub}>Müşteriler iş tamamlandıktan sonra sizi değerlendirecektir.</Text>
          </View>
        ) : (
          reviews.map((rev, i) => (
            <View key={rev.id || i} style={s.reviewCard}>
              <View style={s.reviewHeader}>
                <View style={s.reviewAvatar}>
                  <Text style={s.reviewAvatarText}>
                    {(rev.profiles?.full_name || 'K').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.reviewName}>{rev.profiles?.full_name || 'Müşteri'}</Text>
                  <Text style={s.reviewDate}>
                    {new Date(rev.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
                <View style={s.ratingBox}>
                  <Text style={s.ratingEmoji}>{RATING_EMOJIS[rev.rating] || '😐'}</Text>
                  <Text style={s.ratingValue}>★ {rev.rating}</Text>
                </View>
              </View>

              {rev.comment && (
                <Text style={s.reviewComment}>"{rev.comment}"</Text>
              )}

              {rev.service_category && (
                <View style={s.serviceBadge}>
                  <Text style={s.serviceText}>{rev.service_category}</Text>
                </View>
              )}

              {/* Service items */}
              {rev.service_items?.length > 0 && (
                <View style={s.itemsRow}>
                  {rev.service_items.map((item: string, j: number) => (
                    <View key={j} style={s.itemPill}>
                      <Text style={s.itemText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Meta */}
              <View style={s.metaRow}>
                {rev.price_fair !== null && (
                  <Text style={s.metaText}>{rev.price_fair ? '✅ Fiyat Adil' : '❌ Pahalı'}</Text>
                )}
                {rev.on_time !== null && (
                  <Text style={s.metaText}>{rev.on_time ? '✅ Zamanında' : '❌ Gecikti'}</Text>
                )}
              </View>
            </View>
          ))
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
  headerTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },
  countBadge: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#fff' },

  content: { padding: SPACING.lg },

  // Summary
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: SPACING.lg,
    flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.card,
  },
  summaryLeft: { alignItems: 'center', justifyContent: 'center', width: 100 },
  bigRating: { fontFamily: FONTS.extrabold, fontSize: 48, color: '#1E293B' },
  starsRow: { flexDirection: 'row', marginBottom: 4 },
  totalReviews: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8' },
  summaryRight: { flex: 1, justifyContent: 'center', gap: 6 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distLabel: { fontFamily: FONTS.semibold, fontSize: 12, color: '#64748B', width: 14, textAlign: 'center' },
  distBarBg: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  distBar: { height: 8, borderRadius: 4 },
  distCount: { fontFamily: FONTS.medium, fontSize: 11, color: '#94A3B8', width: 20, textAlign: 'right' },

  // Insights
  insightsRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  insightCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: SPACING.sm,
    alignItems: 'center', borderLeftWidth: 3, ...SHADOW.card,
  },
  insightValue: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#1E293B', marginTop: 4 },
  insightLabel: { fontFamily: FONTS.medium, fontSize: 10, color: '#94A3B8', marginTop: 2 },

  // Section
  sectionTitle: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#1E293B', marginBottom: SPACING.md },

  // Empty
  emptyBox: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#1E293B', marginBottom: 6 },
  emptySub: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },

  // Review Card
  reviewCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: SPACING.md,
    marginBottom: 12, ...SHADOW.card,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  reviewAvatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#EEF2F8',
    alignItems: 'center', justifyContent: 'center',
  },
  reviewAvatarText: { fontFamily: FONTS.semibold, fontSize: 16, color: NAVY },
  reviewName: { fontFamily: FONTS.semibold, fontSize: 14, color: '#1E293B' },
  reviewDate: { fontFamily: FONTS.regular, fontSize: 11, color: '#94A3B8', marginTop: 1 },
  ratingBox: { alignItems: 'center' },
  ratingEmoji: { fontSize: 20, marginBottom: 2 },
  ratingValue: { fontFamily: FONTS.extrabold, fontSize: 14, color: '#D97706' },

  reviewComment: {
    fontFamily: FONTS.regular, fontSize: 14, color: '#475569',
    lineHeight: 22, fontStyle: 'italic', marginBottom: 10,
  },

  serviceBadge: {
    backgroundColor: '#F0F4FF', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 8,
  },
  serviceText: { fontFamily: FONTS.medium, fontSize: 12, color: '#2563EB' },

  itemsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  itemPill: {
    backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  itemText: { fontFamily: FONTS.regular, fontSize: 11, color: '#64748B' },

  metaRow: { flexDirection: 'row', gap: 16 },
  metaText: { fontFamily: FONTS.regular, fontSize: 12, color: '#64748B' },
});
