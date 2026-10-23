import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, TextInput, RefreshControl, AppState,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';
import { readInbox } from '../../lib/inbox';
import { FONTS, SPACING, SHADOW, BORDER_RADIUS } from '../../lib/constants';
import { MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import { MarketplaceBottomNav } from '../../components/MarketplaceUI';

const NAV = T.text;
const AMBER = T.primary;

function IconMenu({ size = 22, color = NAV }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="3" y1="6" x2="21" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="3" y1="18" x2="21" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
function IconMore({ size = 22, color = '#64748B' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="5" r="1.5" fill={color} />
      <Circle cx="12" cy="12" r="1.5" fill={color} />
      <Circle cx="12" cy="19" r="1.5" fill={color} />
    </Svg>
  );
}
function IconSearch({ size = 18, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth="2" />
      <Path d="M21 21l-4.35-4.35" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

interface Conversation {
  id: string;
  other_id: string;
  other_name: string;
  service_category: string | null;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 24) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (hours < 48) return 'DÜN';
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} GÜN ÖNCE`;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

const AVATAR_COLORS = ['#2E5090', '#1E3A5F', '#3B6FB5', '#0F2167', '#4A90D9'];

export default function MechanicMessagesScreen({ role = 'mechanic' }: { role?: 'mechanic' | 'seller' } = {}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const focused = useRef(false);
  const requestVersion = useRef(0);
  const fetchConversations = useCallback(async () => {
    if (loadingRef.current || !focused.current || AppState.currentState !== 'active') return;
    loadingRef.current = true;
    const version = requestVersion.current;
    try {
      const rows = await readInbox();
      if (!focused.current || version !== requestVersion.current) return;
      setConversations(rows);
      setLoadError(null);
    } catch (error: any) {
      if (focused.current && version === requestVersion.current) setLoadError(error?.message || 'Mesajlar yüklenemedi.');
    } finally {
      if (version === requestVersion.current) { loadingRef.current = false; setLoading(false); setRefreshing(false); }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void fetchConversations();
    const timer = setInterval(() => { void fetchConversations(); }, 20000);
    const subscription = AppState.addEventListener('change', state => {
      requestVersion.current += 1; loadingRef.current = false;
      if (state === 'active') void fetchConversations();
    });
    return () => { focused.current = false; requestVersion.current += 1; loadingRef.current = false; clearInterval(timer); subscription.remove(); };
  }, [fetchConversations]));

  const onRefresh = () => { setRefreshing(true); fetchConversations(); };

  const filtered = search.trim()
    ? conversations.filter(c =>
        c.other_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.service_category || '').toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  if (loading) return (
    <View style={st.center}><ActivityIndicator color={NAV} size="large" /></View>
  );

  return (
    <View style={st.root}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity style={st.headerIconBtn} accessibilityRole="button" accessibilityLabel="Geri" onPress={() => router.back()}><Text style={{ color: NAV, fontSize: 26 }}>‹</Text></TouchableOpacity>
        <Text style={st.headerTitle}>Mesajlar</Text>
        <TouchableOpacity style={st.headerIconBtn} accessibilityRole="button" accessibilityLabel="Mesajları yenile" onPress={onRefresh}><Text style={{ color: NAV, fontSize: 24 }}>↻</Text></TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAV} />}
      >
        {loadError && <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={{ paddingVertical: 12, minHeight: 44 }}><Text style={{ color: T.primary }}>{loadError} Tekrar denemek için dokunun.</Text></TouchableOpacity>}
        <Text style={st.subtitle}>Görüşmelerinizi buradan takip edin.</Text>

        <View style={st.searchBar}>
          <IconSearch size={18} color="#94A3B8" />
          <TextInput
            style={st.searchInput}
            placeholder="Mesajlarda ara..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {filtered.length === 0 ? (
          <View style={st.emptyBox}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>💬</Text>
            <Text style={st.emptyTitle}>{loadError ? 'Mesajlar yüklenemedi' : search.trim() ? 'Sonuç bulunamadı' : 'Henüz mesajınız yok'}</Text>
            <Text style={st.emptySub}>{loadError ? 'Bağlantınızı kontrol edip yeniden deneyin.' : search.trim() ? 'Başka bir isim veya kategori deneyin.' : 'Gelen mesajlar burada görünecek.'}</Text>
          </View>
        ) : (
          filtered.map((convo, i) => {
            const initials = convo.other_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

            return (
              <TouchableOpacity
                key={convo.id}
                style={st.convoCard}
                onPress={() => router.push(`/${role}/chat?conversationId=${convo.id}&name=${encodeURIComponent(convo.other_name)}` as any)}
                activeOpacity={0.85}
              >
                <View style={[st.avatar, { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }]}>
                  <Text style={st.avatarText}>{initials}</Text>
                </View>

                <View style={st.convoContent}>
                  <View style={st.convoTopRow}>
                    <Text style={st.convoName} numberOfLines={1}>{convo.other_name}</Text>
                    <Text style={[st.convoTime, convo.unread_count > 0 && { color: AMBER, fontFamily: FONTS.semibold }]}>
                      {formatTime(convo.last_message_at)}
                    </Text>
                  </View>

                  {convo.service_category && (
                    <View style={st.categoryBadge}>
                      <Text style={st.categoryText}>{convo.service_category.toUpperCase()}</Text>
                    </View>
                  )}

                  <Text style={st.convoPreview} numberOfLines={1}>
                    {convo.last_message || 'Henüz mesaj yok'}
                  </Text>
                </View>

                {convo.unread_count > 0 && (
                  <View style={st.unreadBadge}>
                    <Text style={st.unreadText}>{convo.unread_count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
      <MarketplaceBottomNav role={role} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 12,
    paddingHorizontal: 20, backgroundColor: T.background,
  },
  headerIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONTS.extrabold, fontSize: 22, color: T.text },

  content: { paddingHorizontal: 24, paddingTop: 4 },

  subtitle: {
    fontFamily: FONTS.regular, fontSize: 15, color: T.textMuted,
    lineHeight: 22, marginBottom: 18,
  },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: T.surfaceRaised, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: 20,
    ...SHADOW.card,
  },
  searchInput: { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: T.text },

  convoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: T.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: T.border,
    marginBottom: 12, ...SHADOW.card,
  },

  avatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },

  convoContent: { flex: 1, minWidth: 0 },
  convoTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  convoName: { fontFamily: FONTS.extrabold, fontSize: 16, color: T.text, flex: 1, marginRight: 8 },
  convoTime: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8' },

  categoryBadge: {
    backgroundColor: '#1E293B', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 5,
  },
  categoryText: { fontFamily: FONTS.semibold, fontSize: 9, color: '#fff', letterSpacing: 0.5 },

  convoPreview: { fontFamily: FONTS.regular, fontSize: 13, color: T.textMuted, lineHeight: 18 },

  unreadBadge: {
    minWidth: 24, height: 24, borderRadius: 12, backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  unreadText: { fontFamily: FONTS.extrabold, fontSize: 11, color: '#fff' },

  emptyBox: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#1E293B', marginBottom: 8 },
  emptySub: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
});
