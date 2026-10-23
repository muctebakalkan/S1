import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { MARKETPLACE_RADIUS as R, MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import { MarketplaceBottomNav, OrangeButton, ScreenHeader, StatusPill } from '../../components/MarketplaceUI';

type Listing = { id: string; name: string; brand?: string | null; image_url?: string | null; price?: number | null; stock_quantity?: number | null; is_active?: boolean | null; condition?: string | null; oem_code: string };

export function ListingsScreen({ role = 'seller' }: { role?: 'mechanic' | 'seller' }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const updating = useRef(false);
  const loadVersion = useRef(0);
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setLoadError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError.name === 'AuthSessionMissingError' ? new Error('Devam etmek için tekrar giriş yapın.') : authError;
      if (!user) { setListings([]); throw new Error('İlanlarınızı görmek için giriş yapın.'); }
      const { data, error } = await supabase.from('spare_parts').select('id,name,brand,image_url,price,stock_quantity,is_active,condition,oem_code').eq('seller_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      if (version === loadVersion.current) setListings((data ?? []) as Listing[]);
    } catch (error: any) {
      if (version === loadVersion.current) setLoadError(error?.message || 'İlanlar alınamadı.');
    } finally { if (version === loadVersion.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { loadVersion.current += 1; }; }, [load]));
  const update = async (item: Listing, changes: Partial<Listing>) => {
    if (updating.current) return;
    updating.current = true;
    setUpdatingId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Oturum bulunamadı.');
      let q = supabase.from('spare_parts').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', item.id).eq('seller_id', user.id);
      if (changes.stock_quantity !== undefined) q = item.stock_quantity == null ? q.is('stock_quantity', null) : q.eq('stock_quantity', item.stock_quantity);
      const { data, error } = await q.select('id,name,brand,image_url,price,stock_quantity,is_active,condition,oem_code').maybeSingle();
      if (error) throw error;
      if (!data) { await load(); throw new Error('İlan başka bir işlemle güncellendi. Güncel stok yüklendi; tekrar deneyin.'); }
      setListings(current => current.map(row => row.id === item.id ? data as Listing : row));
    } catch (error: any) { Alert.alert('Güncelleme yapılamadı', error?.message || 'Bağlantınızı kontrol edin.'); }
    finally { updating.current = false; setUpdatingId(null); }
  };
  const toggle = (item: Listing) => Alert.alert(item.is_active === false ? 'İlanı yayınla' : 'İlanı yayından kaldır', item.is_active === false ? 'İlan tekrar müşterilere görünür olacak.' : 'İlan silinmez; sadece müşterilere görünmez olur.', [ { text: 'Vazgeç', style: 'cancel' }, { text: item.is_active === false ? 'Yayınla' : 'Yayından kaldır', onPress: () => update(item, { is_active: item.is_active === false }) } ]);
  if (loading) return <View style={s.center}><ActivityIndicator color={T.primary} /></View>;
  return <View style={s.root}><ScreenHeader title="İlanlarım" subtitle="Stoklarını güncelle, ilanlarını yönet" />
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} tintColor={T.primary} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <View style={{ marginBottom: 14 }}><OrangeButton title="Yeni İlan Ver" icon="add" onPress={() => router.push(`/${role}/create-part` as any)} /></View>
      {loadError ? <View style={s.empty}><Text accessibilityRole="alert" style={s.emptyText}>{loadError}</Text><OrangeButton title="Tekrar Dene" onPress={load} /></View> : listings.length === 0 ? <View style={s.empty}><Ionicons name="cube-outline" size={42} color={T.textMuted} /><Text style={s.emptyTitle}>Henüz ilan yok</Text><Text style={s.emptyText}>Yeni ilan verdiğinde burada yönetebilirsin.</Text></View> : listings.map((item) => {
        const outOfStock = (item.stock_quantity ?? 0) <= 0;
        return <View style={[s.card, item.is_active === false && { opacity: 0.62 }]} key={item.id}>
          <View style={s.row}><View style={s.image}>{item.image_url ? <Image source={{ uri: item.image_url }} style={s.imageReal} /> : <Ionicons name="construct" size={28} color={T.textMuted} />}</View><View style={{ flex: 1 }}><Text style={s.name} numberOfLines={1}>{item.brand ? `${item.brand} ` : ''}{item.name}</Text><Text style={s.oem}>OEM {item.oem_code}</Text><Text style={s.price}>{item.price ? `₺${Number(item.price).toLocaleString('tr-TR')}` : 'Fiyat yok'}</Text></View></View>
          <View style={s.meta}><StatusPill label={item.is_active === false ? 'Pasif' : 'Yayında'} tone={item.is_active === false ? 'neutral' : 'success'} /><StatusPill label={outOfStock ? 'Stok yok' : `${item.stock_quantity} stok`} tone={outOfStock ? 'neutral' : 'success'} /></View>
          <View style={s.actions}><TouchableOpacity disabled={updatingId === item.id || outOfStock} style={s.smallButton} onPress={() => update(item, { stock_quantity: Math.max(0, Number(item.stock_quantity || 0) - 1) })}><Ionicons name="remove" size={18} color={T.text} /></TouchableOpacity><TouchableOpacity disabled={updatingId === item.id} style={s.stockButton} onPress={() => update(item, { stock_quantity: Number(item.stock_quantity || 0) + 1 })}><Ionicons name="add" size={17} color="#111317" /><Text style={s.stockText}>Stok Ekle</Text></TouchableOpacity><TouchableOpacity disabled={updatingId === item.id} style={s.toggleButton} onPress={() => router.push({ pathname: `/${role}/edit-part` as any, params: { id: item.id } })}><Ionicons name="create-outline" size={17} color={T.primary} /></TouchableOpacity><TouchableOpacity disabled={updatingId === item.id} style={s.toggleButton} onPress={() => toggle(item)}><Ionicons name={item.is_active === false ? 'eye-outline' : 'eye-off-outline'} size={17} color={T.textSoft} /></TouchableOpacity></View>
        </View>;
      })}
    </ScrollView><MarketplaceBottomNav role={role} />
  </View>;
}

export default function SellerListingsScreen() { return <ListingsScreen role="seller" />; }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.background }, content: { padding: 15, paddingBottom: 112 },
  empty: { alignItems: 'center', paddingTop: 80 }, emptyTitle: { color: T.text, fontWeight: '900', fontSize: 15, marginTop: 12 }, emptyText: { color: T.textMuted, fontSize: 11, marginTop: 5 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.md, padding: 11, marginBottom: 10 }, row: { flexDirection: 'row', gap: 10 }, image: { width: 70, height: 70, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#E4E6E8' }, imageReal: { width: '100%', height: '100%' }, name: { color: T.text, fontSize: 13, fontWeight: '900' }, oem: { color: T.textMuted, fontSize: 9, marginTop: 4 }, price: { color: T.primary, fontSize: 14, fontWeight: '900', marginTop: 7 }, meta: { flexDirection: 'row', gap: 6, marginTop: 10 }, actions: { flexDirection: 'row', gap: 7, marginTop: 10 }, smallButton: { width: 41, height: 39, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surfaceRaised, borderWidth: 1, borderColor: T.border }, stockButton: { flex: 1, minHeight: 39, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, backgroundColor: T.primary }, stockText: { color: '#111317', fontSize: 11, fontWeight: '900' }, toggleButton: { width: 44, height: 39, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surfaceRaised, borderWidth: 1, borderColor: T.border },
});
