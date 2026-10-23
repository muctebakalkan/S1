import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Platform, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
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

type NotifType = 'offer' | 'review' | 'request' | 'system' | 'earnings';

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  time: Date;
  read: boolean;
}

const NOTIF_CONFIG: Record<NotifType, { emoji: string; bg: string; color: string }> = {
  offer:    { emoji: '📩', bg: '#EFF6FF', color: '#2563EB' },
  review:   { emoji: '⭐', bg: '#FEF3C7', color: '#D97706' },
  request:  { emoji: '🔧', bg: '#F0FDF4', color: '#059669' },
  system:   { emoji: '📢', bg: '#EDE9FE', color: '#7C3AED' },
  earnings: { emoji: '💰', bg: '#FFF5E6', color: '#E07B00' },
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

export default function MechanicNotificationsScreen() {
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

      // Offers status changes
      const { data: offers } = await supabase
        .from('offers')
        .select('id, status, price, completed_at, created_at, damage_requests(title)')
        .eq('mechanic_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (offers) {
        offers.forEach(offer => {
          const title = (offer.damage_requests as any)?.title || 'İş Talebi';
          if (offer.status === 'accepted' && !offer.completed_at) {
            notifs.push({
              id: `offer-accepted-${offer.id}`,
              type: 'offer',
              title: 'Teklifiniz Kabul Edildi! 🎉',
              body: `"${title}" için ₺${offer.price} teklifiniz kabul edildi. İşe başlayabilirsiniz.`,
              time: new Date(offer.created_at),
              read: false,
            });
          } else if (offer.status === 'rejected') {
            notifs.push({
              id: `offer-rejected-${offer.id}`,
              type: 'offer',
              title: 'Teklifiniz Reddedildi',
              body: `"${title}" için gönderdiğiniz teklif müşteri tarafından reddedildi.`,
              time: new Date(offer.created_at),
              read: true,
            });
          } else if (offer.completed_at) {
            notifs.push({
              id: `offer-completed-${offer.id}`,
              type: 'earnings',
              title: 'İş Tamamlandı',
              body: `"${title}" işi tamamlandı. ₺${offer.price} kazandınız.`,
              time: new Date(offer.completed_at),
              read: true,
            });
          }
        });
      }

      // New reviews
      const { data: reviews } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at, profiles:profile_directory!user_id(full_name)')
        .eq('mechanic_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (reviews) {
        reviews.forEach(rev => {
          const reviewer = (rev.profiles as any)?.full_name || 'Bir müşteri';
          notifs.push({
            id: `review-${rev.id}`,
            type: 'review',
            title: `${reviewer} sizi değerlendirdi`,
            body: `★ ${rev.rating}/5 puan${rev.comment ? `: "${rev.comment.substring(0, 60)}..."` : ''}`,
            time: new Date(rev.created_at),
            read: false,
          });
        });
      }

      // New pending requests
      const { data: newRequests } = await supabase
        .from('damage_requests')
        .select('id, title, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(3);

      if (newRequests) {
        newRequests.forEach(req => {
          notifs.push({
            id: `req-${req.id}`,
            type: 'request',
            title: 'Yeni İş Talebi',
            body: `"${req.title}" — Teklif vererek bu işi alabilirsiniz.`,
            time: new Date(req.created_at),
            read: true,
          });
        });
      }

      // System notifications
      notifs.push({
        id: 'sys-welcome',
        type: 'system',
        title: 'SanayiX Usta Paneli',
        body: 'Profilinizi tamamlayın ve müsaitlik durumunuzu açık tutarak daha fazla iş alın.',
        time: new Date(user.created_at || Date.now()),
        read: true,
      });

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
          <Text style={s.headerTitle}>Bildirimler</Text>
        </View>
        {unreadCount > 0 && (
          <View style={s.unreadBadge}>
            <Text style={s.unreadText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeAnim }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
      >
        {notifications.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>🔔</Text>
            <Text style={s.emptyTitle}>Bildirim Yok</Text>
            <Text style={s.emptySub}>Yeni iş talepleri ve teklif güncellemeleri burada görünecek.</Text>
          </View>
        ) : (
          <>
            {unreadCount > 0 && (
              <>
                <Text style={s.sectionLabel}>YENİ ({unreadCount})</Text>
                {notifications.filter(n => !n.read).map(notif => {
                  const config = NOTIF_CONFIG[notif.type];
                  return (
                    <TouchableOpacity
                      key={notif.id}
                      style={[s.notifCard, s.notifCardUnread]}
                      onPress={() => markAsRead(notif.id)} activeOpacity={0.85}
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

            {notifications.filter(n => n.read).length > 0 && (
              <>
                <Text style={s.sectionLabel}>GEÇMİŞ</Text>
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
    borderLeftWidth: 3, borderLeftColor: NAVY,
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
