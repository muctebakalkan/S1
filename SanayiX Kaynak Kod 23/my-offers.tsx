import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Platform, RefreshControl, Alert,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
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

const TABS = [
  { id: 'accepted', label: 'Aktif', emoji: '🔧' },
  { id: 'pending',  label: 'Bekleyen', emoji: '⏳' },
  { id: 'completed', label: 'Tamamlanan', emoji: '✅' },
  { id: 'rejected', label: 'Reddedilen', emoji: '❌' },
];

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Bekliyor',     bg: '#FEF3C7', color: '#D97706' },
  accepted:  { label: 'Aktif',        bg: '#DBEAFE', color: '#2563EB' },
  completed: { label: 'Tamamlandı',  bg: '#D1FAE5', color: '#059669' },
  rejected:  { label: 'Reddedildi',  bg: '#FEE2E2', color: '#DC2626' },
};

function timeAgo(d: string) {
  const m = (Date.now() - new Date(d).getTime()) / 60000;
  if (m < 1) return 'Az önce';
  if (m < 60) return `${Math.floor(m)} dk önce`;
  if (m < 1440) return `${Math.floor(m / 60)} sa önce`;
  return `${Math.floor(m / 1440)} gün önce`;
}

export default function MyOffersScreen() {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('accepted');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { fetchOffers(); }, []);

  const fetchOffers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('offers')
        .select('*, damage_requests(title,description,damage_area,urgency_level,status,created_at,vehicles(brand,model,year)), profiles:damage_requests(user_id:profile_directory!user_id(full_name))')
        .eq('mechanic_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setOffers(data);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const onRefresh = () => { setRefreshing(true); fetchOffers(); };

  const filtered = offers.filter(o => {
    if (activeTab === 'completed') return o.completed_at != null;
    if (activeTab === 'accepted') return o.status === 'accepted' && !o.completed_at;
    return o.status === activeTab;
  });

  const counts = {
    accepted: offers.filter(o => o.status === 'accepted' && !o.completed_at).length,
    pending: offers.filter(o => o.status === 'pending').length,
    completed: offers.filter(o => o.completed_at != null).length,
    rejected: offers.filter(o => o.status === 'rejected').length,
  };

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
          <Text style={s.headerTitle}>Tekliflerim & İşlerim</Text>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countText}>{offers.length}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[s.tab, activeTab === tab.id && s.tabActive]}
              onPress={() => setActiveTab(tab.id)} activeOpacity={0.8}
            >
              <Text style={s.tabEmoji}>{tab.emoji}</Text>
              <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>
                {tab.label} ({counts[tab.id as keyof typeof counts]})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeAnim }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📋</Text>
            <Text style={s.emptyTitle}>Teklif Bulunamadı</Text>
            <Text style={s.emptySub}>
              {activeTab === 'accepted' ? 'Aktif işiniz yok.' :
               activeTab === 'pending' ? 'Bekleyen teklifiniz yok.' :
               activeTab === 'completed' ? 'Tamamlanan işiniz yok.' :
               'Reddedilen teklifiniz yok.'}
            </Text>
          </View>
        ) : (
          filtered.map(offer => {
            const req = offer.damage_requests;
            const status = offer.completed_at
              ? STATUS_MAP.completed
              : STATUS_MAP[offer.status] || STATUS_MAP.pending;
            const veh = req?.vehicles;

            return (
              <View key={offer.id} style={s.offerCard}>
                {/* Top */}
                <View style={s.offerTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.offerTitle} numberOfLines={1}>{req?.title || 'İş Talebi'}</Text>
                    {veh && <Text style={s.offerVehicle}>{veh.brand} {veh.model} · {veh.year}</Text>}
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>

                {/* Details */}
                <View style={s.offerDetailsRow}>
                  <View style={s.offerDetailItem}>
                    <Text style={s.detailLabel}>Fiyat Teklifiniz</Text>
                    <Text style={s.detailValue}>₺{Number(offer.price || 0).toLocaleString('tr-TR')}</Text>
                  </View>
                  {offer.estimated_delivery && (
                    <View style={s.offerDetailItem}>
                      <Text style={s.detailLabel}>Teslim Süresi</Text>
                      <Text style={s.detailValue}>{offer.estimated_delivery}</Text>
                    </View>
                  )}
                  <View style={s.offerDetailItem}>
                    <Text style={s.detailLabel}>Tarih</Text>
                    <Text style={s.detailValue}>{timeAgo(offer.created_at)}</Text>
                  </View>
                </View>

                {offer.note && (
                  <View style={s.noteBox}>
                    <Text style={s.noteText}>💬 {offer.note}</Text>
                  </View>
                )}

                {/* Tags */}
                <View style={s.tagsRow}>
                  {req?.damage_area && (
                    <View style={s.areaPill}>
                      <Text style={s.areaPillText}>📍 {req.damage_area}</Text>
                    </View>
                  )}
                  {req?.urgency_level === 'Yüksek' && (
                    <View style={s.urgentPill}>
                      <Text style={s.urgentPillText}>⚡ ACİL</Text>
                    </View>
                  )}
                </View>

                {/* Actions */}
                {offer.status === 'accepted' && !offer.completed_at && (
                  <TouchableOpacity
                    style={s.completeBtn}
                    onPress={() => router.push(`/mechanic/job-detail?id=${offer.request_id}` as any)}
                    activeOpacity={0.85}
                  >
                    <Text style={s.completeBtnText}>🔧 İşi Yönet</Text>
                  </TouchableOpacity>
                )}

                {offer.completed_at && !offer.reviewed && (
                  <View style={s.reviewHint}>
                    <Text style={s.reviewHintText}>⭐ Müşteri değerlendirme bekliyor</Text>
                  </View>
                )}

                {offer.reviewed && (
                  <View style={s.reviewedBadge}>
                    <Text style={s.reviewedText}>✅ Değerlendirildi</Text>
                  </View>
                )}
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
  headerTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },
  countBadge: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#fff' },

  // Tabs
  tabRow: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: BORDER_RADIUS.full, backgroundColor: '#F1F5F9',
  },
  tabActive: { backgroundColor: NAVY },
  tabEmoji: { fontSize: 14 },
  tabText: { fontFamily: FONTS.semibold, fontSize: 12, color: '#64748B' },
  tabTextActive: { color: '#fff' },

  content: { padding: SPACING.lg },

  // Empty
  emptyBox: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#1E293B', marginBottom: 6 },
  emptySub: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', textAlign: 'center' },

  // Offer card
  offerCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: SPACING.md,
    marginBottom: 12, ...SHADOW.card,
  },
  offerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  offerTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: '#1E293B', marginBottom: 3 },
  offerVehicle: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8' },
  statusBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontFamily: FONTS.semibold, fontSize: 11 },

  offerDetailsRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  offerDetailItem: {},
  detailLabel: { fontFamily: FONTS.medium, fontSize: 10, color: '#94A3B8', marginBottom: 2, letterSpacing: 0.3 },
  detailValue: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#1E293B' },

  noteBox: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: SPACING.sm,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: AMBER,
  },
  noteText: { fontFamily: FONTS.regular, fontSize: 13, color: '#64748B', fontStyle: 'italic' },

  tagsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  areaPill: { backgroundColor: '#F0F4FF', borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  areaPillText: { fontFamily: FONTS.medium, fontSize: 11, color: '#2563EB' },
  urgentPill: { backgroundColor: '#FEE2E2', borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  urgentPillText: { fontFamily: FONTS.semibold, fontSize: 11, color: '#DC2626' },

  completeBtn: {
    backgroundColor: '#059669', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center',
  },
  completeBtnText: { fontFamily: FONTS.semibold, fontSize: 14, color: '#fff' },

  reviewHint: {
    backgroundColor: '#FEF3C7', borderRadius: 10, paddingVertical: 8,
    alignItems: 'center',
  },
  reviewHintText: { fontFamily: FONTS.medium, fontSize: 12, color: '#92400E' },

  reviewedBadge: {
    backgroundColor: '#D1FAE5', borderRadius: 10, paddingVertical: 8,
    alignItems: 'center',
  },
  reviewedText: { fontFamily: FONTS.medium, fontSize: 12, color: '#059669' },
});
