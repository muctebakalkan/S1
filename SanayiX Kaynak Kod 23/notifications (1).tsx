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
import BottomNavBar from '../../components/BottomNavBar';

const NAV_BLUE = '#001E52';

function IconBack({ size = 22, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

type NotifType = 'maintenance' | 'offer' | 'review' | 'system' | 'request';

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  time: Date;
  read: boolean;
}

const NOTIF_CONFIG: Record<NotifType, { emoji: string; bg: string; color: string }> = {
  maintenance: { emoji: '🔧', bg: '#FFF5E6', color: '#E07B00' },
  offer:       { emoji: '📩', bg: '#EFF6FF', color: '#2563EB' },
  review:      { emoji: '⭐', bg: '#FEF3C7', color: '#D97706' },
  system:      { emoji: '📢', bg: '#F0FDF4', color: '#059669' },
  request:     { emoji: '📋', bg: '#EDE9FE', color: '#7C3AED' },
};

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return date.toLocaleDateString('tr-TR');
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { generateNotifications(); }, []);

  const generateNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const notifs: Notification[] = [];

      // Bakım hatırlatması — araç bilgisinden
      const { data: vehicles } = await supabase
        .from('vehicles').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (vehicles) {
        vehicles.forEach(v => {
          if (v.last_service_date) {
            const lastDate = new Date(v.last_service_date);
            const diffMonths = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (diffMonths >= 6) {
              notifs.push({
                id: `maint-${v.id}`,
                type: 'maintenance',
                title: 'Bakım Zamanı Geldi!',
                body: `${v.brand} ${v.model} aracınızın son bakımının üzerinden ${Math.floor(diffMonths)} ay geçti. Periyodik bakım için randevu alın.`,
                time: new Date(Date.now() - 2 * 60 * 60 * 1000),
                read: false,
              });
            } else if (diffMonths >= 4) {
              notifs.push({
                id: `maint-soon-${v.id}`,
                type: 'maintenance',
                title: 'Bakım Yaklaşıyor',
                body: `${v.brand} ${v.model} aracınızın bakım zamanı yaklaşıyor. ${Math.ceil(6 - diffMonths)} ay sonra bakıma götürmeniz önerilir.`,
                time: new Date(Date.now() - 24 * 60 * 60 * 1000),
                read: true,
              });
            }

            // KM uyarısı
            if (v.mileage && v.mileage > 10000) {
              const nextServiceKm = Math.ceil(v.mileage / 10000) * 10000;
              if (nextServiceKm - v.mileage < 500) {
                notifs.push({
                  id: `km-${v.id}`,
                  type: 'maintenance',
                  title: 'Kilometre Bakım Uyarısı',
                  body: `${v.brand} ${v.model} — ${nextServiceKm.toLocaleString('tr-TR')} km bakım sınırına yaklaştınız.`,
                  time: new Date(Date.now() - 12 * 60 * 60 * 1000),
                  read: false,
                });
              }
            }
          }
        });
      }

      // Talep bildirimleri
      const { data: requests } = await supabase
        .from('damage_requests').select('id, title, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(5);

      if (requests) {
        requests.forEach(req => {
          if (req.status === 'active') {
            notifs.push({
              id: `req-active-${req.id}`,
              type: 'request',
              title: 'Talebiniz Aktif!',
              body: `"${req.title}" talebiniz aktif durumda. Usta çalışmaya başladı.`,
              time: new Date(req.created_at),
              read: true,
            });
          } else if (req.status === 'completed') {
            notifs.push({
              id: `req-done-${req.id}`,
              type: 'request',
              title: 'İş Tamamlandı',
              body: `"${req.title}" talebi tamamlandı. Değerlendirmenizi bekliyoruz.`,
              time: new Date(req.created_at),
              read: false,
            });
          }
        });
      }

      // Sistem bildirimi
      notifs.push({
        id: 'sys-welcome',
        type: 'system',
        title: 'SanayiX\'e Hoş Geldiniz!',
        body: 'Aracınızı ekleyin ve yakınınızdaki en iyi ustaları keşfedin.',
        time: new Date(user.created_at || Date.now()),
        read: true,
      });

      // Tarih sırasına göre
      notifs.sort((a, b) => b.time.getTime() - a.time.getTime());
      setNotifications(notifs);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const onRefresh = () => { setRefreshing(true); generateNotifications(); };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) return (
    <View style={s.center}><ActivityIndicator color={NAV_BLUE} size="large" /></View>
  );

  return (
    <View style={s.root}>
      {/* Header */}
      <LinearGradient colors={['#080E1A', '#0F2749']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <IconBack size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={s.headerSub}>SanayiX</Text>
          <Text style={s.headerTitle}>Bildirimler</Text>
        </View>
        {unreadCount > 0 && (
          <View style={s.unreadBadge}>
            <Text style={s.unreadText}>{unreadCount}</Text>
          </View>
        )}
      </LinearGradient>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeAnim }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAV_BLUE} />}
      >
        {notifications.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>🔔</Text>
            <Text style={s.emptyTitle}>Bildirim Yok</Text>
            <Text style={s.emptySub}>Bakım hatırlatmaları ve talep güncellemeleri burada görünecek.</Text>
          </View>
        ) : (
          <>
            {/* Unread */}
            {unreadCount > 0 && (
              <>
                <Text style={s.sectionLabel}>YENİ ({unreadCount})</Text>
                {notifications.filter(n => !n.read).map(notif => {
                  const config = NOTIF_CONFIG[notif.type];
                  return (
                    <TouchableOpacity
                      key={notif.id}
                      style={[s.notifCard, s.notifCardUnread]}
                      onPress={() => markAsRead(notif.id)}
                      activeOpacity={0.85}
                    >
                      <View style={[s.notifIcon, { backgroundColor: config.bg }]}>
                        <Text style={{ fontSize: 22 }}>{config.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.notifTitle}>{notif.title}</Text>
                        <Text style={s.notifBody} numberOfLines={2}>{notif.body}</Text>
                        <Text style={s.notifTime}>{timeAgo(notif.time)}</Text>
                      </View>
                      <View style={[s.unreadDot, { backgroundColor: config.color }]} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* Read */}
            {notifications.filter(n => n.read).length > 0 && (
              <>
                <Text style={s.sectionLabel}>OKUNMUŞ</Text>
                {notifications.filter(n => n.read).map(notif => {
                  const config = NOTIF_CONFIG[notif.type];
                  return (
                    <View key={notif.id} style={s.notifCard}>
                      <View style={[s.notifIcon, { backgroundColor: config.bg, opacity: 0.7 }]}>
                        <Text style={{ fontSize: 22 }}>{config.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.notifTitle, { color: '#94A3B8' }]}>{notif.title}</Text>
                        <Text style={[s.notifBody, { color: '#CBD5E1' }]} numberOfLines={2}>{notif.body}</Text>
                        <Text style={s.notifTime}>{timeAgo(notif.time)}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        <View style={{ height: 20 }} />
      </Animated.ScrollView>

      {/* Alt Navigasyon */}
      <BottomNavBar activeTab="messages" />
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
  unreadBadge: {
    minWidth: 28, height: 28, borderRadius: 14, backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  unreadText: { fontFamily: FONTS.extrabold, fontSize: 13, color: '#fff' },

  content: { padding: SPACING.lg },

  // Empty
  emptyBox: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontFamily: FONTS.extrabold, fontSize: 22, color: '#1E293B', marginBottom: 6 },
  emptySub: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },

  // Section
  sectionLabel: {
    fontFamily: FONTS.semibold, fontSize: 11, color: '#94A3B8',
    letterSpacing: 1.2, marginBottom: SPACING.sm, marginTop: SPACING.sm,
  },

  // Notif Card
  notifCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: SPACING.md,
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md,
    marginBottom: 10, ...SHADOW.card,
  },
  notifCardUnread: {
    borderLeftWidth: 3, borderLeftColor: NAV_BLUE,
    backgroundColor: '#FAFBFF',
  },
  notifIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  notifTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: '#1E293B', marginBottom: 3 },
  notifBody: { fontFamily: FONTS.regular, fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 4 },
  notifTime: { fontFamily: FONTS.regular, fontSize: 11, color: '#CBD5E1' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
});
