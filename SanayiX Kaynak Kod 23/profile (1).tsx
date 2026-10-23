import { currentGps } from '../../lib/location';
import SanayixLogo from '../../components/SanayixLogo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, StatusBar, Platform, KeyboardAvoidingView, Modal, FlatList, Image,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { loadMechanicProfile, saveMechanicProfile, addMechanicService, updateMechanicService, setMechanicServiceActive, requireMechanicSession } from '../../lib/mechanicProfile';
import { supabase } from '../../lib/supabase';
import { FONTS, SHADOW, SPECIALTIES } from '../../lib/constants';

const NAV = T.primary;
const AMBER = T.primary;
const AVAIL_OPTS = [
  { id: 'available', label: 'BUGÜN\nMÜSAİT', icon: '✅' },
  { id: 'busy', label: 'YOĞUN', icon: '⚠️' },
  { id: 'closed', label: 'KAPALI', icon: '❌' },
];

export default function MechanicProfileScreen() {
  const insets = useSafeAreaInsets();
  const writing = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mp, setMp] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [reviewCount, setReviewCount] = useState(0);

  // Form
  const [fullName, setFullName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [serviceAreas, setServiceAreas] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [locating,setLocating] = useState(false);
  const [hasGps,setHasGps] = useState(false);
  const updateGps=async()=>{if(locating)return;setLocating(true);try { const point=await currentGps();const result=await supabase.rpc('save_mechanic_location',{p_latitude:point.latitude,p_longitude:point.longitude});if(result.error)throw result.error;setHasGps(true);Alert.alert('Konum kaydedildi','İşyeri konumunuz yakın usta aramasında kullanılacak.');}catch(e:any){Alert.alert('Konum kaydedilemedi',e.message);}finally{setLocating(false);}};
  const [availability, setAvailability] = useState<'available' | 'busy' | 'closed'>('available');

  // New service form
  const [showAddService, setShowAddService] = useState(false);
  const [svcTitle, setSvcTitle] = useState('');
  const [svcMin, setSvcMin] = useState('');
  const [svcMax, setSvcMax] = useState('');
  const [svcWarranty, setSvcWarranty] = useState('');
  const [svcDelivery, setSvcDelivery] = useState('');
  const [catModal, setCatModal] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const handleError = (error: any) => {
    if (error?.code === 'session_required') { router.replace('/auth/login'); return; }
    Alert.alert('İşlem tamamlanamadı', error?.message || 'Bağlantınızı kontrol edip yeniden deneyin.');
  };
  const fetchAll = async () => {
    setLoadError('');
    try {
      const result = await loadMechanicProfile(supabase), m = result.profile;
      setHasGps(m.latitude != null && m.longitude != null); setMp(m); setFullName(m.full_name || ''); setSpecialty(m.specialty || '');
      setPhone(m.phone || ''); setCity(m.city || ''); setDistrict(m.district || '');
      setServiceAreas(m.service_areas || ''); setWorkingHours(m.working_hours || '');
      setAvailability(['available', 'busy', 'closed'].includes(m.availability_status) ? m.availability_status : m.is_available === false ? 'closed' : 'available');
      setReviews(result.reviews); setReviewCount(result.reviews.length); setServices(result.services);
    } catch (error: any) {
      if (error?.code === 'session_required') router.replace('/auth/login');
      else setLoadError(error?.message || 'Profil yüklenemedi. Bağlantınızı kontrol edin.');
    } finally { setLoading(false); }
  };
  const change = async (action: () => Promise<void>) => {
    if (writing.current) return;
    writing.current = true; setSaving(true);
    try { await action(); } catch (error) { handleError(error); }
    finally { writing.current = false; setSaving(false); }
  };
  const handleSave = () => change(async () => {
    await saveMechanicProfile(supabase, {
      full_name: fullName.trim(), specialty: specialty.trim(), phone: phone.trim(),
      city: city.trim(), district: district.trim(), service_areas: serviceAreas.trim(),
      working_hours: workingHours.trim(), is_available: availability !== 'closed', availability_status: availability,
    });
    Alert.alert('Profil güncellendi', 'Değişiklikleriniz kaydedildi.');
  });
  const addService = () => change(async () => {
    const values = { title: svcTitle, min: svcMin, max: svcMax, warranty: svcWarranty, delivery: svcDelivery };
    if (editingServiceId) await updateMechanicService(supabase, editingServiceId, values);
    else await addMechanicService(supabase, values);
    setEditingServiceId(null);
    setSvcTitle(''); setSvcMin(''); setSvcMax(''); setSvcWarranty(''); setSvcDelivery(''); setShowAddService(false);
    await fetchAll();
  });
  const openServiceEditor = (service?: any) => {
    if (writing.current) return;
    setEditingServiceId(service?.id ?? null);
    setSvcTitle(service?.title ?? ''); setSvcMin(service?.min_price == null ? '' : String(service.min_price));
    setSvcMax(service?.max_price == null ? '' : String(service.max_price));
    setSvcWarranty(service?.warranty ?? ''); setSvcDelivery(service?.delivery ?? '');
    setShowAddService(true); scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const toggleService = (id: string, active: boolean) => change(async () => {
    await setMechanicServiceActive(supabase, id, !active); await fetchAll();
  });

  const pickImage = async () => {
    if (writing.current) return;
    writing.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setLoading(true);
        const user = await requireMechanicSession(supabase);
        
        const ext = result.assets[0].uri.split('.').pop() || 'jpg';
        const fileName = `${user.id}/${Date.now()}.${ext}`;
        
        // Upload to Supabase Storage
        const { error } = await supabase.storage
          .from('avatars')
          .upload(fileName, decode(result.assets[0].base64), {
            contentType: `image/${ext}`,
            upsert: true,
          });
          
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
        const saved = await supabase.from('mechanic_profiles').update({ avatar_url: publicUrl }).eq('user_id', user.id).select('user_id').single();
        if (saved.error || !saved.data) {
          await supabase.storage.from('avatars').remove([fileName]).catch(() => undefined);
          throw saved.error || new Error('Fotoğraf profilinize kaydedilemedi.');
        }
        setMp((current: any) => ({ ...current, avatar_url: publicUrl }));
      }
    } catch (error) { handleError(error); }
    finally { writing.current = false; setLoading(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={NAV} size="large" /></View>;

  if (loadError) return <View style={s.center}><Text accessibilityRole="alert" style={{ color: NAV, padding: 20 }}>{loadError}</Text><TouchableOpacity onPress={() => { setLoading(true); void fetchAll(); }}><Text style={s.addLink}>Tekrar Dene</Text></TouchableOpacity><TouchableOpacity onPress={() => router.replace('/auth/login')}><Text style={[s.addLink, { marginTop: 20 }]}>Girişe Dön</Text></TouchableOpacity></View>;

  const initials = fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      {/* Header */}
      <StatusBar barStyle="light-content" backgroundColor={T.background} />
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SanayixLogo theme="light" iconSize={36} fontSize={22} />
        </View>
        <TouchableOpacity onPress={() => router.push('/mechanic/notifications' as any)}>
          <Text style={{ fontSize: 20 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>Profilim</Text>
        <Text style={s.pageSub}>Müşterilerin göreceği usta profilinizi yönetin.</Text>

        {/* Profile Card */}
        <View style={s.profileCard}>
          <View style={s.avatarWrap}>
            <View style={s.avatar}>
              {mp?.avatar_url ? (
                <Image source={{ uri: mp.avatar_url }} style={{ width: 100, height: 100, borderRadius: 16 }} />
              ) : (
                <Text style={s.avatarText}>{initials}</Text>
              )}
            </View>
            <TouchableOpacity style={s.editAvatar} onPress={pickImage} activeOpacity={0.8}>
              <Text style={{ fontSize: 12 }}>✏️</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <View style={s.verifiedBadge}><Text style={s.verifiedText}>{mp?.is_verified === true ? '✅ DOĞRULANDI' : 'DOĞRULAMA BEKLENİYOR'}</Text></View>
            <View style={s.liveBadge}><Text style={s.liveText}>⚡ PROFİL YAYINDA</Text></View>
          </View>
          <Text style={s.profileName}>{fullName || 'Usta'}</Text>
          <Text style={s.profileSpec}>{specialty || 'Motor & Bakım'} Uzmanı</Text>
          {Number(mp?.rating) > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Text style={{ fontSize: 18, color: AMBER }}>★</Text>
              <Text style={s.ratingBig}>{Number(mp.rating).toFixed(1)}</Text>
              <Text style={s.ratingCount}>({reviewCount} değerlendirme)</Text>
            </View>
          )}
        </View>

        {/* Services (Moved to Top) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <Text style={s.sectionTitle}>Hizmetlerim</Text>
          <TouchableOpacity onPress={() => showAddService ? setShowAddService(false) : openServiceEditor()}><Text style={s.addLink}>{showAddService ? 'Kapat' : '+ Hizmet Ekle'}</Text></TouchableOpacity>
        </View>

        {showAddService && (
          <View style={s.addCard}>
            <TouchableOpacity style={s.selectBtn} onPress={() => setCatModal(true)}>
              <Text style={svcTitle ? s.selectText : s.selectPlaceholder}>
                {svcTitle || 'Kategori Seçin'}
              </Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TextInput style={[s.fieldInput, { flex: 1 }]} placeholder="Min TL" value={svcMin} onChangeText={setSvcMin} keyboardType="numeric" placeholderTextColor="#94A3B8" />
              <TextInput style={[s.fieldInput, { flex: 1 }]} placeholder="Max TL" value={svcMax} onChangeText={setSvcMax} keyboardType="numeric" placeholderTextColor="#94A3B8" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TextInput style={[s.fieldInput, { flex: 1 }]} placeholder="Garanti" value={svcWarranty} onChangeText={setSvcWarranty} placeholderTextColor="#94A3B8" />
              <TextInput style={[s.fieldInput, { flex: 1 }]} placeholder="Teslimat" value={svcDelivery} onChangeText={setSvcDelivery} placeholderTextColor="#94A3B8" />
            </View>
            <TouchableOpacity style={[s.saveBtn, { marginTop: 12 }]} onPress={addService} activeOpacity={0.85}>
              <Text style={s.saveBtnText}>{editingServiceId ? 'Hizmet Değişikliklerini Kaydet' : 'Hizmet Ekle'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {services.map(svc => (
          <View key={svc.id} style={s.serviceCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.svcName}>{svc.title}</Text>
              <View style={[s.activeBadge, !svc.is_active && { backgroundColor: '#FEE2E2' }]}>
                <Text style={[s.activeText, !svc.is_active && { color: '#DC2626' }]}>{svc.is_active ? 'AKTİF' : 'PASİF'}</Text>
              </View>
            </View>
            <Text style={s.svcPrice}>{svc.min_price == null || svc.max_price == null ? 'Fiyat belirtilmemiş' : `${Number(svc.min_price).toLocaleString('tr-TR')} TL - ${Number(svc.max_price).toLocaleString('tr-TR')} TL`}</Text>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
              <Text style={s.svcMeta}>🛡 {svc.warranty}</Text>
              <Text style={s.svcMeta}>🕐 {svc.delivery}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity accessibilityRole="button" style={s.svcActionBtn} onPress={() => openServiceEditor(svc)} activeOpacity={0.8}><Text style={s.svcActionText}>Düzenle</Text></TouchableOpacity>
              <TouchableOpacity style={s.svcActionBtn} onPress={() => toggleService(svc.id, svc.is_active)} activeOpacity={0.8}>
                <Text style={s.svcActionText}>{svc.is_active ? 'Pasife Al' : 'Aktif Et'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Editable Fields */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>Temel Bilgiler</Text>
        <Field label="İŞLETME ADI" value={fullName} onChange={setFullName} />
        <Field label="UZMANLIK ALANI" value={specialty} onChange={setSpecialty} />
        <Field label="TELEFON" value={phone} onChange={setPhone} keyboard="phone-pad" />
        <Field label="KONUM" value={`${district}${district && city ? ', ' : ''}${city}`} onChange={(v: string) => { const parts = v.split(','); setDistrict(parts[0]?.trim() || ''); setCity(parts[1]?.trim() || city); }} />
        <TouchableOpacity accessibilityRole="button" disabled={locating} onPress={updateGps} style={s.previewBtn}><Text style={s.previewBtnText}>{locating ? 'Konum alınıyor…' : 'Konumumu Kullan'}</Text></TouchableOpacity>
        <Text style={{color:T.textMuted,marginBottom:16}}>{hasGps ? 'İşyeri GPS konumu kayıtlı. İşyerindeyken konumu güncelleyebilirsiniz.' : 'Yakın usta aramasında görünmek için işyerinizin GPS konumunu kaydedin.'}</Text>
        <Field label="HİZMET VERİLEN BÖLGELER" value={serviceAreas} onChange={setServiceAreas} placeholder="Sarıyer, Beşiktaş, Kağıthane, Şişli" />
        <Field label="ÇALIŞMA SAATLERİ" value={workingHours} onChange={setWorkingHours} />

        {/* Availability */}
        <Text style={s.sectionTitle}>Müsaitlik Durumu</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -30, marginBottom: 10 }}>
          <View style={s.statusBadge}><Text style={s.statusText}>{availability === 'available' ? 'ŞU AN AÇIK' : availability === 'busy' ? 'YOĞUN' : 'KAPALI'}</Text></View>
        </View>
        <View style={s.availRow}>
          {AVAIL_OPTS.map(opt => (
            <TouchableOpacity key={opt.id} style={[s.availBtn, availability === opt.id && s.availBtnActive]} onPress={() => setAvailability(opt.id as 'available' | 'busy' | 'closed')} activeOpacity={0.8}>
              <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
              <Text style={[s.availLabel, availability === opt.id && s.availLabelActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Müsaitliği Güncelle */}
        <TouchableOpacity style={s.updateAvailBtn} onPress={() => router.push('/mechanic/availability' as any)} activeOpacity={0.85}>
          <Text style={s.updateAvailText}>Müsaitliği Güncelle</Text>
        </TouchableOpacity>

        {/* Price info */}
        <View style={s.priceInfoBox}>
          <Text style={{ fontSize: 16 }}>ℹ️</Text>
          <Text style={s.priceInfoText}>Fiyat aralıkları araç modeli, parça durumu ve işlem kapsamına göre değişebilir.{'\n\n'}Garanti süresi her hizmet için ayrı belirlenebilir.</Text>
        </View>

        {/* Reviews */}
        <Text style={s.sectionTitle}>Müşteri Yorumları</Text>
        {reviews.length === 0 ? (
          <View style={s.emptyCard}><Text style={s.emptyText}>Henüz yorum yok</Text></View>
        ) : reviews.map(rev => (
          <View key={rev.id} style={s.reviewCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={s.reviewAuthor}>{rev.profiles?.full_name || 'Kullanıcı'}</Text>
              <Text style={s.reviewRating}>★ {Number(rev.rating).toFixed(1)}</Text>
            </View>
            <Text style={s.reviewService}>HİZMET: {(rev.damage_requests?.title || rev.damage_requests?.damage_area || 'Genel').toUpperCase()}</Text>
            {rev.comment && <Text style={s.reviewComment}>"{rev.comment}"</Text>}
          </View>
        ))}

        {/* Save & Preview */}
        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Değişiklikleri Kaydet</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.previewBtn} onPress={() => {
          if (mp?.user_id) router.push(`/user/mechanic-profile?id=${mp.user_id}` as any);
        }} activeOpacity={0.85}>
          <Text style={s.previewBtnText}>Müşteri Gözünden Önizle</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.previewBtn} onPress={() => router.push('/user/settings')} accessibilityRole="button"><Text style={s.previewBtnText}>Hesap Ayarları ve Gizlilik</Text></TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Kategori Modal */}
      <Modal visible={catModal} animationType="slide" transparent onRequestClose={() => setCatModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Kategori Seç</Text>
            <FlatList
              data={SPECIALTIES}
              keyExtractor={i => i}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.modalItem}
                  onPress={() => { setSvcTitle(item); setCatModal(false); }}>
                  <Text style={s.modalItemText}>{item}</Text>
                  {svcTitle === item && <Text style={{ fontSize: 18, color: NAV }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, placeholder, keyboard }: any) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.fieldInput} value={value} onChangeText={onChange}
        placeholder={placeholder || ''} placeholderTextColor="#94A3B8" keyboardType={keyboard || 'default'} />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 58 : 42, paddingBottom: 10, paddingHorizontal: 20, backgroundColor: T.background,
  },
  headerLogo: { fontFamily: FONTS.extrabold, fontSize: 22, color: NAV, fontStyle: 'italic' },
  content: { paddingHorizontal: 20 },
  pageTitle: { fontFamily: FONTS.extrabold, fontSize: 28, color: T.text, marginBottom: 4 },
  pageSub: { fontFamily: FONTS.regular, fontSize: 14, color: T.textMuted, marginBottom: 18 },

  profileCard: { backgroundColor: T.surface, borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 20, ...SHADOW.card },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 100, height: 100, borderRadius: 16, backgroundColor: '#3B5998', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontFamily: FONTS.extrabold, fontSize: 36, color: '#fff' },
  editAvatar: { position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  verifiedBadge: { backgroundColor: T.successBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  verifiedText: { fontFamily: FONTS.extrabold, fontSize: 10, color: T.success },
  liveBadge: { backgroundColor: '#33230F', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  liveText: { fontFamily: FONTS.extrabold, fontSize: 10, color: AMBER },
  profileName: { fontFamily: FONTS.extrabold, fontSize: 24, color: T.text, marginTop: 4 },
  profileSpec: { fontFamily: FONTS.regular, fontSize: 14, color: T.textSoft },
  ratingBig: { fontFamily: FONTS.extrabold, fontSize: 20, color: T.text },
  ratingCount: { fontFamily: FONTS.regular, fontSize: 13, color: T.textMuted },

  fieldLabel: { fontFamily: FONTS.semibold, fontSize: 10, color: T.textMuted, letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  fieldInput: { backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, fontFamily: FONTS.regular, fontSize: 15, color: T.text, borderWidth: 1, borderColor: T.border },

  sectionTitle: { fontFamily: FONTS.extrabold, fontSize: 22, color: T.text, marginTop: 20, marginBottom: 12 },
  addLink: { fontFamily: FONTS.semibold, fontSize: 14, color: T.primary },

  statusBadge: { backgroundColor: T.successBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontFamily: FONTS.extrabold, fontSize: 10, color: T.success, letterSpacing: 0.5 },
  availRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  availBtn: { flex: 1, backgroundColor: T.surface, borderRadius: 18, paddingVertical: 18, alignItems: 'center', borderWidth: 1.5, borderColor: T.border },
  availBtnActive: { backgroundColor: NAV, borderColor: NAV },
  availLabel: { fontFamily: FONTS.semibold, fontSize: 11, color: T.textSoft, textAlign: 'center', marginTop: 6 },
  availLabelActive: { color: '#111317' },
  updateAvailBtn: { backgroundColor: T.primary, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 6 },
  updateAvailText: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#111317' },

  addCard: { backgroundColor: T.surface, borderRadius: 20, padding: 18, marginBottom: 14, ...SHADOW.card },
  serviceCard: { backgroundColor: T.surface, borderRadius: 22, padding: 20, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: T.primary, ...SHADOW.card },
  svcName: { fontFamily: FONTS.extrabold, fontSize: 18, color: T.text },
  svcPrice: { fontFamily: FONTS.extrabold, fontSize: 15, color: T.primary, marginTop: 4 },
  svcMeta: { fontFamily: FONTS.regular, fontSize: 12, color: T.textMuted },
  activeBadge: { backgroundColor: T.successBg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  activeText: { fontFamily: FONTS.extrabold, fontSize: 10, color: T.success },
  svcActionBtn: { flex: 1, borderWidth: 1.5, borderColor: T.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  svcActionText: { fontFamily: FONTS.semibold, fontSize: 13, color: T.textSoft },

  priceInfoBox: { backgroundColor: T.surfaceRaised, borderRadius: 18, padding: 18, flexDirection: 'row', gap: 12, marginTop: 14, marginBottom: 6, borderWidth: 1, borderColor: T.border },
  priceInfoText: { fontFamily: FONTS.regular, fontSize: 13, color: T.textSoft, flex: 1, lineHeight: 20 },

  reviewCard: { backgroundColor: T.surface, borderRadius: 20, padding: 20, marginBottom: 10, ...SHADOW.card },
  reviewAuthor: { fontFamily: FONTS.extrabold, fontSize: 16, color: T.text },
  reviewRating: { fontFamily: FONTS.extrabold, fontSize: 15, color: AMBER },
  reviewService: { fontFamily: FONTS.semibold, fontSize: 10, color: T.textMuted, letterSpacing: 0.8, marginTop: 4 },
  reviewComment: { fontFamily: FONTS.regular, fontSize: 14, color: T.textSoft, fontStyle: 'italic', marginTop: 8, lineHeight: 22 },
  emptyCard: { backgroundColor: T.surface, borderRadius: 18, padding: 24, alignItems: 'center', ...SHADOW.card },
  emptyText: { fontFamily: FONTS.regular, fontSize: 14, color: T.textMuted },

  saveBtn: { backgroundColor: NAV, borderRadius: 18, paddingVertical: 20, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontFamily: FONTS.extrabold, fontSize: 17, color: '#111317' },
  previewBtn: { backgroundColor: T.surface, borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginTop: 10, borderWidth: 1.5, borderColor: T.border },
  previewBtnText: { fontFamily: FONTS.extrabold, fontSize: 16, color: T.text },

  selectBtn: { backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 1, borderColor: T.border, justifyContent: 'center' },
  selectText: { fontFamily: FONTS.regular, fontSize: 15, color: T.text },
  selectPlaceholder: { fontFamily: FONTS.regular, fontSize: 15, color: T.textMuted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, maxHeight: '70%' },
  modalTitle: { fontFamily: FONTS.extrabold, fontSize: 18, color: T.text, paddingHorizontal: 20, marginBottom: 16 },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.border },
  modalItemText: { fontFamily: FONTS.medium, fontSize: 16, color: T.text },
});
