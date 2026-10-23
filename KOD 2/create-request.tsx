import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, FlatList, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { analyzeDamage } from '../../lib/aiDamageAnalysis';
import { removeDamageImage, uploadDamageImage } from '../../lib/damageImages';
import { DAMAGE_AREAS } from '../../lib/constants';
import { MARKETPLACE_RADIUS as R, MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import { MarketplaceBottomNav, OrangeButton, ScreenHeader } from '../../components/MarketplaceUI';

let ImagePicker: any = null;
try { ImagePicker = require('expo-image-picker'); } catch (_) {}

export default function CreateRequestScreen() {
  const [vehicle, setVehicle] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleError, setVehicleError] = useState('');
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehicleRetry, setVehicleRetry] = useState(0);
  const [step, setStep] = useState(0);
  const sendLock = useRef(false);
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      try {
        setVehicleError(''); setVehiclesLoading(true);
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError.name === 'AuthSessionMissingError' ? new Error('Devam etmek için tekrar giriş yapın.') : authError;
        if (!user) throw new Error('Arıza bildirmek için giriş yapın.');
        const { data, error } = await supabase.from('vehicles').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (error) throw error;
        if (!active) return;
        setVehicles(data ?? []);
        setVehicle((current: any) => data?.find(row => row.id === current?.id) ?? data?.[0] ?? null);
      } catch (error: any) { if (active) setVehicleError(error?.message || 'Araçlar yüklenemedi.'); }
      finally { if (active) setVehiclesLoading(false); }
    })();
    return () => { active = false; };
  }, [vehicleRetry]));

  const pickImage = async () => {
    if (!ImagePicker) return Alert.alert('Bilgi', 'Fotoğraf seçici bu cihazda kullanılamıyor');
    try {
      // Android uses the system picker; it grants access only to the selected image.
      if (Platform.OS === 'ios') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return Alert.alert('İzin gerekli', 'Fotoğraf eklemek için galeri izni vermelisiniz');
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.76, allowsEditing: true, base64: true });
      if (!result.canceled) {
        const asset = result.assets?.[0];
        if (!asset?.base64) throw new Error('Fotoğraf okunamadı. Başka bir fotoğraf deneyin.');
        if (asset.base64.length * 3 / 4 > 5 * 1024 * 1024) throw new Error('5 MB altında bir fotoğraf seçin.');
        setImageUri(asset.uri); setImageBase64(asset.base64);
      }
    } catch (error: any) { Alert.alert('Fotoğraf seçilemedi', error?.message || 'Tekrar deneyin.'); }
  };

  const review = () => {
    if (!vehicle || vehicleError) return Alert.alert('Araç gerekli', 'Kayıtlı araçlarınızı kontrol edip bir araç seçin.');
    if (!area || description.trim().length < 10) return Alert.alert('Eksik bilgi', 'Arıza türünü seçin ve sorunu en az 10 karakterle anlatın.');
    setStep(1);
  };

  const submit = async () => {
    if (sendLock.current) return;
    if (!vehicle) return Alert.alert('Araç gerekli', 'Arıza bildirmek için önce aracınızı ekleyin');
    if (!area || !description.trim()) return Alert.alert('Eksik bilgi', 'Arıza türünü seçin ve sorunu anlatın');
    sendLock.current = true; setLoading(true);
    let uploadedImagePath: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Oturum bulunamadı');
      const requestId = Crypto.randomUUID();
      const analysis = await analyzeDamage(imageBase64, description.trim());
      if (imageBase64) {
        uploadedImagePath = await uploadDamageImage({ base64: imageBase64, userId: user.id, requestId });
      }
      const { error } = await supabase.from('damage_requests').insert({
        id: requestId,
        user_id: user.id,
        vehicle_id: vehicle.id,
        title: `${area} Arızası`,
        description: description.trim(),
        damage_area: area,
        image_url: uploadedImagePath,
        ai_summary: `${analysis.damageType} - ${analysis.possibleAction}`,
        recommended_specialty: analysis.recommendedSpecialty,
        urgency_level: analysis.urgencyLevel,
        status: 'pending',
      });
      if (error) throw error;
      setStep(2);
    } catch (error: any) {
      await removeDamageImage(uploadedImagePath);
      Alert.alert('Hata', error?.message || 'Talep oluşturulamadı');
    } finally {
      sendLock.current = false; setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Arıza Bildir" subtitle="Aracındaki sorunu anlat, en uygun ustayı bulalım." />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.steps}>
            {['Arıza', 'Detay', 'Onay'].map((label, index) => (
              <React.Fragment key={label}>
                <View style={s.stepItem}>
                  <View style={[s.stepCircle, index === step && s.stepCircleActive]}>
                    <Text style={[s.stepNumber, index === step && s.stepNumberActive]}>{index + 1}</Text>
                  </View>
                  <Text style={[s.stepLabel, index === step && s.stepLabelActive]}>{label}</Text>
                </View>
                {index < 2 && <View style={[s.stepLine, index === step && { backgroundColor: T.primary }]} />}
              </React.Fragment>
            ))}
          </View>

          {step === 0 && <>
          {!!vehicleError && <View><Text style={s.error} accessibilityRole="alert">{vehicleError}</Text><OrangeButton title="Araçları Yenile" onPress={() => setVehicleRetry(value => value + 1)} /></View>}
          <Text style={s.label}>Araç</Text>
          <TouchableOpacity style={s.select} disabled={vehiclesLoading} onPress={() => vehicles.length ? setVehicleOpen(true) : router.push('/user/my-vehicles' as any)}>
            <Text style={[s.selectText, !vehicle && s.placeholder]}>
              {vehicle ? `${vehicle.brand} ${vehicle.model}  ${vehicle.year}${vehicle.engine ? `  ${vehicle.engine}` : ''}` : vehiclesLoading ? 'Araçlar yükleniyor…' : 'Araç ekleyin'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={T.textMuted} />
          </TouchableOpacity>

          <Text style={s.label}>Arıza türü</Text>
          <TouchableOpacity style={s.select} onPress={() => setAreaOpen(true)}>
            <Text style={[s.selectText, !area && s.placeholder]}>{area || 'Arıza bölgesini seçin'}</Text>
            <Ionicons name="chevron-down" size={18} color={T.textMuted} />
          </TouchableOpacity>

          <Text style={s.label}>Sorunu anlat</Text>
          <TextInput
            style={s.description}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
            placeholder="Arıza ışığı yanıyor araç tekliyor rölantide dalgalanma var"
            placeholderTextColor={T.textMuted}
            textAlignVertical="top"
          />

          <TouchableOpacity style={s.mediaButton} onPress={pickImage} activeOpacity={0.82}>
            {imageUri ? <Image source={{ uri: imageUri }} style={s.preview} /> : <View style={s.cameraBox}><Ionicons name="camera" size={19} color={T.primary} /></View>}
            <Text style={s.mediaText}>{imageUri ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}</Text>
            <Text style={s.mediaCount}>{imageUri ? '1' : '0'}/1</Text>
          </TouchableOpacity>

          <OrangeButton title="En Uygun Ustaları Bul" onPress={review} disabled={vehiclesLoading || !!vehicleError} />
          </>}
          {step === 1 && <View style={s.reviewCard}>
            <Text style={s.howTitle}>Talebini kontrol et</Text>
            <Text style={s.reviewTitle}>{vehicle?.brand} {vehicle?.model} · {vehicle?.year}</Text>
            <Text style={s.reviewTitle}>{area}</Text>
            <Text style={s.reviewText}>{description.trim()}</Text>
            {!!imageUri && <Image source={{ uri: imageUri }} style={s.reviewImage} resizeMode="contain" />}
            <OrangeButton title={loading ? 'Talep oluşturuluyor…' : 'Talebi Yayınla'} onPress={submit} disabled={loading} />
            <TouchableOpacity disabled={loading} style={s.editButton} onPress={() => setStep(0)}><Text style={s.reviewText}>Bilgileri düzenle</Text></TouchableOpacity>
          </View>}
          {step === 2 && <View style={s.reviewCard}>
            <Ionicons name="checkmark-circle" size={48} color={T.success} />
            <Text style={s.howTitle}>Talebin yayınlandı</Text>
            <Text style={s.reviewText}>Uygun ustalar talebini görüp teklif verebilecek.</Text>
            <OrangeButton title="Taleplerimi Gör" onPress={() => router.replace('/user/my-requests' as any)} />
          </View>}
          {loading && <ActivityIndicator color={T.primary} style={{ marginTop: 12 }} />}

          <View style={s.howCard}>
            <Text style={s.howTitle}>Nasıl çalışır?</Text>
            {['Arızanı bildir', 'Uygun ustalar teklif versin', 'Fiyatları karşılaştır ustanı seç'].map((text, index) => (
              <View key={text} style={s.howRow}>
                <View style={s.howNumber}><Text style={s.howNumberText}>{index + 1}</Text></View>
                <Text style={s.howText}>{text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <MarketplaceBottomNav role="user" />

      <Modal visible={vehicleOpen} transparent animationType="slide" onRequestClose={() => setVehicleOpen(false)}>
        <View style={s.modalBackdrop}><View style={s.modalSheet}>
          <Text style={s.modalTitle}>Araç seçin</Text>
          <FlatList data={vehicles} keyExtractor={item => item.id} renderItem={({ item }) => <TouchableOpacity style={s.modalItem} onPress={() => { setVehicle(item); setVehicleOpen(false); }}>
            <Text style={s.modalItemText}>{item.brand} {item.model} · {item.year}</Text>
            {vehicle?.id === item.id && <Ionicons name="checkmark-circle" size={20} color={T.primary} />}
          </TouchableOpacity>} />
          <TouchableOpacity style={s.editButton} onPress={() => setVehicleOpen(false)}><Text style={s.reviewText}>Vazgeç</Text></TouchableOpacity>
        </View></View>
      </Modal>
      <Modal visible={areaOpen} transparent animationType="slide" onRequestClose={() => setAreaOpen(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setAreaOpen(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Arıza bölgesi seçin</Text>
            <FlatList
              data={DAMAGE_AREAS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.modalItem} onPress={() => { setArea(item); setAreaOpen(false); }}>
                  <Text style={s.modalItemText}>{item}</Text>
                  {area === item && <Ionicons name="checkmark-circle" size={20} color={T.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  error: { color: T.danger, marginBottom: 14, fontSize: 12 },
  reviewCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.md, padding: 16, gap: 14 },
  reviewTitle: { color: T.text, fontSize: 14, fontWeight: '700' },
  reviewText: { color: T.textSoft, fontSize: 13, lineHeight: 20 },
  reviewImage: { width: '100%', height: 180 },
  editButton: { alignItems: 'center', paddingVertical: 12 },
  root: { flex: 1, backgroundColor: T.background },
  content: { paddingHorizontal: 16, paddingBottom: 115 },
  steps: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 23, paddingHorizontal: 15 },
  stepItem: { alignItems: 'center', width: 54 },
  stepCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { backgroundColor: T.primary },
  stepNumber: { color: T.textMuted, fontSize: 12, fontWeight: '700' },
  stepNumberActive: { color: '#111' },
  stepLabel: { color: T.textMuted, fontSize: 10, marginTop: 6 },
  stepLabelActive: { color: T.text, fontWeight: '600' },
  stepLine: { flex: 1, height: 2, backgroundColor: T.border, marginTop: 15 },
  label: { color: T.textSoft, fontSize: 11, fontWeight: '600', marginBottom: 7, marginTop: 4 },
  select: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.surfaceRaised, borderWidth: 1, borderColor: T.border, borderRadius: R.sm, paddingHorizontal: 13, marginBottom: 14 },
  selectText: { color: T.text, fontSize: 12, fontWeight: '700' },
  placeholder: { color: T.textMuted, fontWeight: '500' },
  description: { minHeight: 100, color: T.text, fontSize: 13, lineHeight: 20, backgroundColor: T.surfaceRaised, borderWidth: 1, borderColor: T.border, borderRadius: R.sm, padding: 13, marginBottom: 12 },
  mediaButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.sm, padding: 8, marginBottom: 18 },
  cameraBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#2A1A0C', alignItems: 'center', justifyContent: 'center' },
  preview: { width: 38, height: 38, borderRadius: 8 },
  mediaText: { flex: 1, color: T.textSoft, fontSize: 12, fontWeight: '700' },
  mediaCount: { color: T.textMuted, fontSize: 11 },
  howCard: { marginTop: 18 },
  howTitle: { color: T.text, fontSize: 14, fontWeight: '700', marginBottom: 10 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  howNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: T.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  howNumberText: { color: T.textSoft, fontSize: 11, fontWeight: '700' },
  howText: { color: T.textSoft, fontSize: 11 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  modalSheet: { maxHeight: '72%', backgroundColor: T.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32 },
  modalHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 15 },
  modalTitle: { color: T.text, fontSize: 17, fontWeight: '700', marginBottom: 10 },
  modalItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: T.border },
  modalItemText: { color: T.textSoft, fontSize: 14 },
});
