import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { MARKETPLACE_RADIUS as R, MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import { MarketplaceBottomNav, ScreenHeader } from '../../components/MarketplaceUI';

export default function SellerProfileScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) { router.replace('/auth/login'); return; }
      const { data, error: profileError } = await supabase.from('seller_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!data) throw new Error('Mağaza profili bulunamadı. Yeniden giriş yaparak kaydı tamamlayın.');
      setProfile(data);
    } catch (failure: any) { setError(failure?.message || 'Mağaza profili yüklenemedi.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const leave = () => Alert.alert('Çıkış yap', 'Satıcı hesabından çıkmak istiyor musun?', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Çıkış yap', style: 'destructive', onPress: async () => { try { await signOut(); router.replace('/auth/login'); } catch { Alert.alert('Çıkış yapılamadı', 'Lütfen tekrar deneyin.'); } } }]);
  if (loading) return <View style={s.center}><ActivityIndicator color={T.primary} /></View>;
  if (error || !profile) return <View style={s.root}><ScreenHeader title="Mağaza Profili" subtitle="Satıcı hesabın" /><View style={s.content}><Text style={s.person} accessibilityRole="alert">{error || 'Profil bulunamadı.'}</Text><TouchableOpacity style={s.logout} onPress={() => load()}><Text style={s.logoutText}>Tekrar dene</Text></TouchableOpacity><TouchableOpacity style={s.logout} onPress={() => router.push('/user/settings')} accessibilityRole="button"><Text style={s.logoutText}>Hesap Ayarları ve Gizlilik</Text></TouchableOpacity><TouchableOpacity style={s.logout} onPress={leave}><Text style={s.logoutText}>Çıkış Yap</Text></TouchableOpacity></View><MarketplaceBottomNav role="seller" /></View>;
  return <View style={s.root}><ScreenHeader title="Mağaza Profili" subtitle="Satıcı hesabın" /><View style={s.content}><View style={s.card}><View style={s.icon}><Ionicons name="storefront" size={28} color={T.primary} /></View><Text style={s.name}>{profile.store_name || profile.full_name}</Text><Text style={s.person}>{profile.full_name}</Text><Text style={s.meta}>{[profile.district, profile.city].filter(Boolean).join(' · ') || 'Konum eklenmemiş'}</Text></View><TouchableOpacity style={s.logout} onPress={() => router.push('/user/settings')} accessibilityRole="button"><Text style={s.logoutText}>Hesap Ayarları ve Gizlilik</Text></TouchableOpacity><TouchableOpacity style={s.logout} onPress={leave}><Ionicons name="log-out-outline" size={19} color="#FB7185" /><Text style={s.logoutText}>Çıkış Yap</Text></TouchableOpacity></View><MarketplaceBottomNav role="seller" /></View>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: T.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.background }, content: { padding: 15 }, card: { alignItems: 'center', padding: 24, backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: R.md }, icon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#2A1B0D' }, name: { color: T.text, fontWeight: '900', fontSize: 19, marginTop: 14 }, person: { color: T.textSoft, fontSize: 12, marginTop: 5 }, meta: { color: T.textMuted, fontSize: 10, marginTop: 7 }, logout: { marginTop: 14, minHeight: 49, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', gap: 7, flexDirection: 'row', borderWidth: 1, borderColor: '#4A1D28', backgroundColor: '#23141A' }, logoutText: { color: '#FB7185', fontWeight: '800', fontSize: 12 } });
