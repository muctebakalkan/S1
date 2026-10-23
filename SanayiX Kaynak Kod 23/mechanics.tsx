import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../../lib/constants';

const TABS = ['Tümü', 'Bekliyor', 'Onaylı', 'Reddedildi'];
const STATUS_MAP: Record<string, string> = {
  'Tümü': '', 'Bekliyor': 'pending', 'Onaylı': 'approved', 'Reddedildi': 'rejected',
};

export default function AdminMechanics() {
  const [tab, setTab]         = useState('Tümü');
  const [data, setData]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [tab]);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('mechanic_profiles')
      .select('id,full_name,city,district,specialty,specialties,rating,review_count,tier,verification_status,is_verified,created_at')
      .order('created_at', { ascending: false });
    if (STATUS_MAP[tab]) q = q.eq('verification_status', STATUS_MAP[tab]);
    const { data: d } = await q;
    setData(d ?? []);
    setLoading(false);
  };

  const tierColor: Record<string, string> = {
    premium: '#D97706', approved: '#2563EB', new: '#6B7280',
  };
  const statusBg: Record<string, string> = {
    pending: '#FEF3C7', approved: '#D1FAE5', rejected: '#FEE2E2',
  };
  const statusTxt: Record<string, string> = {
    pending: '#D97706', approved: '#059669', rejected: '#DC2626',
  };
  const statusLabel: Record<string, string> = {
    pending: 'Bekliyor', approved: 'Onaylı', rejected: 'Reddedildi',
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Geri</Text>
        </TouchableOpacity>
        <Text style={s.title}>Ustalar</Text>
        <Text style={s.count}>{data.length}</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading
        ? <ActivityIndicator color="#001E52" style={{ marginTop: 40 }} size="large" />
        : (
          <FlatList
            data={data}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: SPACING.lg, gap: 10 }}
            renderItem={({ item: m }) => (
              <TouchableOpacity style={s.card}
                onPress={() => router.push({ pathname: '/admin/mechanic-detail' as any, params: { id: m.id } })}>
                <View style={s.avatarBox}>
                  <Text style={s.avatarText}>{m.full_name?.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={s.name}>{m.full_name}</Text>
                    {m.tier && (
                      <Text style={[s.tierBadge, { color: tierColor[m.tier] || '#6B7280' }]}>
                        {m.tier === 'premium' ? '⭐' : m.tier === 'approved' ? '✅' : '🆕'}
                      </Text>
                    )}
                  </View>
                  <Text style={s.city}>{m.district}, {m.city}</Text>
                  <Text style={s.spec}>{m.specialties?.join(' · ') || m.specialty}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <Text style={s.rating}>★ {m.rating?.toFixed(1) || '0.0'} ({m.review_count || 0})</Text>
                    <View style={[s.statusPill, { backgroundColor: statusBg[m.verification_status] || '#F3F4F6' }]}>
                      <Text style={[s.statusPillText, { color: statusTxt[m.verification_status] || '#6B7280' }]}>
                        {statusLabel[m.verification_status] || m.verification_status}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />
        )
      }
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F8' },
  header: {
    backgroundColor: '#001E52', paddingTop: 60, paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  back:  { fontFamily: FONTS.medium, fontSize: 15, color: 'rgba(255,255,255,0.8)' },
  title: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },
  count: { fontFamily: FONTS.semibold, fontSize: 15, color: 'rgba(255,255,255,0.7)' },

  tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: SPACING.md, gap: 6, ...SHADOW.header },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.background },
  tabActive: { backgroundColor: '#001E52' },
  tabText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textSecondary },
  tabTextActive: { color: '#fff', fontFamily: FONTS.semibold },

  card: {
    backgroundColor: '#fff', borderRadius: BORDER_RADIUS.xl, padding: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, ...SHADOW.card,
  },
  avatarBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#001E52', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },
  name:  { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text },
  tierBadge: { fontSize: 16 },
  city:  { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textSecondary },
  spec:  { fontFamily: FONTS.medium, fontSize: 12, color: '#2563EB' },
  rating: { fontFamily: FONTS.medium, fontSize: 12, color: '#D97706' },
  statusPill: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  statusPillText: { fontFamily: FONTS.semibold, fontSize: 11 },
  chevron: { fontSize: 22, color: COLORS.textSecondary },
});
