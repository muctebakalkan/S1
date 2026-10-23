import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../../lib/constants';

function IconArrowLeft({ size = 20, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconStar({ size = 16, color = '#D97706', filled = false }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase
      .from('reviews')
      .select(`
        id, rating, comment, service_category, created_at,
        profiles!reviews_user_id_fkey(full_name, email),
        mechanic_profiles!reviews_mechanic_id_fkey(full_name, city)
      `)
      .order('created_at', { ascending: false });
    setReviews(data ?? []);
    setLoading(false);
  };

  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '0';

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <IconArrowLeft />
          <Text style={s.back}>Geri</Text>
        </TouchableOpacity>
        <Text style={s.title}>Değerlendirmeler</Text>
        <View style={s.countBadge}>
          <Text style={s.countText}>★ {avg}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#001E52" style={{ marginTop: 40 }} size="large" />
      ) : reviews.length === 0 ? (
        <View style={s.emptyWrap}>
          <IconStar size={48} color="#CBD5E1" />
          <Text style={s.emptyText}>Henüz değerlendirme yok</Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: SPACING.lg, gap: 10 }}
          renderItem={({ item: r }) => {
            const user     = (r as any).profiles;
            const mechanic = (r as any).mechanic_profiles;
            return (
              <View style={s.card}>
                {/* Yıldızlar + Kategori */}
                <View style={s.topRow}>
                  <View style={s.starsRow}>
                    {[1,2,3,4,5].map(n => (
                      <IconStar key={n} size={16} color="#F59E0B" filled={n <= r.rating} />
                    ))}
                    <Text style={s.ratingNum}>{r.rating}/5</Text>
                  </View>
                  {r.service_category && (
                    <View style={s.catBadge}>
                      <Text style={s.catText}>{r.service_category}</Text>
                    </View>
                  )}
                </View>

                {/* Yorum */}
                {r.comment ? (
                  <Text style={s.comment}>{r.comment}</Text>
                ) : (
                  <Text style={s.noComment}>Yorum yapılmamış</Text>
                )}

                {/* Kullanıcı → Usta */}
                <View style={s.metaRow}>
                  <View style={s.metaItem}>
                    <Text style={s.metaLabel}>Kullanıcı</Text>
                    <Text style={s.metaValue}>{user?.full_name || '—'}</Text>
                  </View>
                  <View style={s.metaDivider} />
                  <View style={s.metaItem}>
                    <Text style={s.metaLabel}>Usta</Text>
                    <Text style={s.metaValue}>{mechanic?.full_name || '—'}</Text>
                    {mechanic?.city && <Text style={s.metaSub}>{mechanic.city}</Text>}
                  </View>
                  <View style={s.metaDivider} />
                  <View style={s.metaItem}>
                    <Text style={s.metaLabel}>Tarih</Text>
                    <Text style={s.metaValue}>{new Date(r.created_at).toLocaleDateString('tr-TR')}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F8' },
  header: {
    backgroundColor: '#001E52', paddingTop: 60, paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  back:       { fontFamily: FONTS.medium, fontSize: 15, color: 'rgba(255,255,255,0.85)' },
  title:      { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },
  countBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  countText:  { fontFamily: FONTS.semibold, fontSize: 14, color: '#F59E0B' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 80 },
  emptyText: { fontFamily: FONTS.medium, fontSize: 15, color: '#94A3B8' },

  card: { backgroundColor: '#fff', borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, ...SHADOW.card },

  topRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  starsRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingNum: { fontFamily: FONTS.semibold, fontSize: 13, color: '#92400E', marginLeft: 4 },
  catBadge:  { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  catText:   { fontFamily: FONTS.medium, fontSize: 11, color: '#2563EB' },

  comment:   { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.text, lineHeight: 20, marginBottom: 10 },
  noComment: { fontFamily: FONTS.regular, fontSize: 12, color: '#CBD5E1', fontStyle: 'italic', marginBottom: 10 },

  metaRow:     { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, gap: 0 },
  metaItem:    { flex: 1, alignItems: 'center' },
  metaDivider: { width: 1, backgroundColor: COLORS.border },
  metaLabel:   { fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textLight, marginBottom: 2 },
  metaValue:   { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.text, textAlign: 'center' },
  metaSub:     { fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textSecondary },
});
