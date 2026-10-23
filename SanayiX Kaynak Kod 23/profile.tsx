import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { signOut as signOutAccount } from '../../lib/auth';
import { MARKETPLACE_RADIUS as R, MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import { MarketplaceBottomNav, SanayixWordmark } from '../../components/MarketplaceUI';

const MENU = [
  { label: 'Araçlarım', subtitle: 'Araç bilgilerini ve bakım durumunu yönet', icon: 'car-sport-outline', route: '/user/my-vehicles' },
  { label: 'Taleplerim', subtitle: 'Arıza taleplerini ve teklifleri görüntüle', icon: 'document-text-outline', route: '/user/my-requests' },
  { label: 'Randevularım', subtitle: 'Yaklaşan servis randevularını takip et', icon: 'calendar-outline', route: '/user/appointments' },
  { label: 'Bildirimler', subtitle: 'Uygulama bildirimlerini görüntüle', icon: 'notifications-outline', route: '/user/notifications' },
  { label: 'Ayarlar', subtitle: 'Hesap güvenliği ve tercihler', icon: 'settings-outline', route: '/user/settings' },
  { label: 'Yardım ve Destek', subtitle: 'Soruların için bize ulaş', icon: 'help-circle-outline', route: '/user/help' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ vehicles: 0, requests: 0, completed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.replace('/landing');
        return;
      }

      setUser(currentUser);
      const [profileResult, vehiclesResult, requestsResult, completedResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
        supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id),
        supabase.from('damage_requests').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id),
        supabase.from('damage_requests').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id).eq('status', 'completed'),
      ]);

      setProfile(profileResult.data ?? null);
      setStats({
        vehicles: vehiclesResult.count ?? 0,
        requests: requestsResult.count ?? 0,
        completed: completedResult.count ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  const signOut = () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinize emin misiniz', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOutAccount();
            router.replace('/landing');
          } catch {
            Alert.alert('Çıkış yapılamadı', 'Lütfen tekrar deneyin.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={T.primary} size="large" /></View>;
  }

  const fullName = profile?.full_name || user?.email?.split('@')[0] || 'SanayiX Kullanıcısı';
  const initials = fullName
    .split(' ')
    .map((word: string) => word.charAt(0))
    .join('')
    .toLocaleUpperCase('tr-TR')
    .slice(0, 2);

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, 18) + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <SanayixWordmark size={22} />
          <TouchableOpacity style={s.headerButton} onPress={() => router.push('/user/settings' as any)}>
            <Ionicons name="settings-outline" size={20} color={T.text} />
          </TouchableOpacity>
        </View>

        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
            <View style={s.verifiedDot}><Ionicons name="checkmark" size={12} color="#101317" /></View>
          </View>
          <Text style={s.name}>{fullName}</Text>
          <Text style={s.email}>{user?.email}</Text>
          {!!profile?.phone && <Text style={s.phone}>{profile.phone}</Text>}
          <TouchableOpacity style={s.editButton} onPress={() => router.push('/user/complete-profile' as any)} activeOpacity={0.82}>
            <Ionicons name="create-outline" size={16} color="#111317" />
            <Text style={s.editButtonText}>Profili Düzenle</Text>
          </TouchableOpacity>
        </View>

        <View style={s.statsRow}>
          <Stat value={stats.vehicles} label="Araç" />
          <Stat value={stats.requests} label="Talep" />
          <Stat value={stats.completed} label="Tamamlanan" />
        </View>

        <Text style={s.sectionTitle}>Hesabım</Text>
        <View style={s.menuCard}>
          {MENU.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[s.menuItem, index === MENU.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.78}
            >
              <View style={s.menuIcon}><Ionicons name={item.icon as any} size={20} color={T.primary} /></View>
              <View style={s.menuCopy}>
                <Text style={s.menuLabel}>{item.label}</Text>
                <Text style={s.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={T.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.signOutButton} onPress={signOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={19} color={T.danger} />
          <Text style={s.signOutText}>Çıkış Yap</Text>
        </TouchableOpacity>

        <Text style={s.version}>SanayiX  v1.2.6</Text>
      </ScrollView>
      <MarketplaceBottomNav role="user" />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.background },
  content: { paddingHorizontal: 16, paddingBottom: 112 },
  header: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerButton: { width: 39, height: 39, borderRadius: 13, backgroundColor: T.surfaceRaised, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  profileCard: { alignItems: 'center', backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.lg, padding: 19 },
  avatar: { width: 76, height: 76, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A1B0D', borderWidth: 1, borderColor: T.borderWarm },
  avatarText: { color: T.primary, fontSize: 26, fontWeight: '900' },
  verifiedDot: { position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: T.primary, borderWidth: 3, borderColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  name: { color: T.text, fontSize: 19, fontWeight: '900', marginTop: 13 },
  email: { color: T.textMuted, fontSize: 11, marginTop: 4 },
  phone: { color: T.textSoft, fontSize: 11, marginTop: 3 },
  editButton: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: T.primary, borderRadius: R.sm, paddingHorizontal: 21, marginTop: 15 },
  editButtonText: { color: '#111317', fontSize: 11, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 9, marginTop: 11 },
  stat: { flex: 1, minHeight: 66, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.md },
  statValue: { color: T.primary, fontSize: 19, fontWeight: '900' },
  statLabel: { color: T.textMuted, fontSize: 9, marginTop: 3 },
  sectionTitle: { color: T.text, fontSize: 15, fontWeight: '900', marginTop: 20, marginBottom: 9 },
  menuCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.md, paddingHorizontal: 12 },
  menuItem: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: T.border },
  menuIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A1B0D' },
  menuCopy: { flex: 1 },
  menuLabel: { color: T.text, fontSize: 12, fontWeight: '800' },
  menuSubtitle: { color: T.textMuted, fontSize: 9, marginTop: 3 },
  signOutButton: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#231316', borderWidth: 1, borderColor: '#5B272D', borderRadius: R.md, marginTop: 13 },
  signOutText: { color: T.danger, fontSize: 12, fontWeight: '900' },
  version: { color: T.textMuted, fontSize: 9, textAlign: 'center', marginTop: 17 },
});
