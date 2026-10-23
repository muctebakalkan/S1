import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Image, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { resolveDamageImageUrl } from '../../lib/damageImages';
import { submitRequestOffer, completeRequestOffer } from '../../lib/requestOffers';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../../lib/constants';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { CarIcon, ClockIcon, AlertIcon, MapPinIcon } from '../../components/icons';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<any>(null);
  const [offerModalVisible, setOfferModalVisible] = useState(false);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [loading, setLoading] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [myOffer, setMyOffer] = useState<any>(null);
  const [completing, setCompleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);
  const sending = useRef(false);
  const completionLock = useRef(false);

  const fetchData = useCallback(async () => {
    const version = ++loadVersion.current;
    setFetching(true);
    setLoadError('');
    try {
      if (!id) throw new Error('Talep bulunamadı.');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError.name === 'AuthSessionMissingError' ? new Error('Devam etmek için tekrar giriş yapın.') : authError;
      if (!user) throw new Error('Talebi görmek için tekrar giriş yapın.');
      const [reqResult, offerResult] = await Promise.all([
        supabase.from('damage_requests').select('*').eq('id', id).maybeSingle(),
        supabase.from('offers').select('*').eq('request_id', id).eq('mechanic_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (reqResult.error) throw reqResult.error;
      if (offerResult.error) throw offerResult.error;
      if (!reqResult.data) throw new Error('Bu talep bulunamadı veya görüntüleme izniniz yok.');
      const display_image_url = await resolveDamageImageUrl(reqResult.data.image_url);
      if (version !== loadVersion.current) return;
      setRequest({ ...reqResult.data, display_image_url });
      setMyOffer(offerResult.data);
      setOfferSent(Boolean(offerResult.data));
    } catch (error: any) {
      if (version === loadVersion.current) {
        setRequest(null);
        setMyOffer(null);
        setOfferSent(false);
        setLoadError(error.message || 'Talep yüklenemedi.');
      }
    } finally {
      if (version === loadVersion.current) setFetching(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void fetchData();
    return () => { loadVersion.current += 1; };
  }, [fetchData]));

  const handleSendOffer = async () => {
    if (sending.current) return;
    sending.current = true;
    setLoading(true);
    try {
      const data = await submitRequestOffer(id, price, note, estimatedDelivery);
      setMyOffer(data);
      setOfferSent(true);
      setOfferModalVisible(false);
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Teklif gönderilemedi.');
    } finally {
      sending.current = false;
      setLoading(false);
    }
  };

  // Ustanın işi tamamladı olarak işaretlemesi
  const handleMarkComplete = async () => {
    if (completionLock.current || myOffer?.status !== 'accepted') return;
    Alert.alert(
      'İşi Tamamla',
      'Müşterinin kabul ettiği bu işi tamamlandı olarak işaretlemek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tamamlandı',
          onPress: async () => {
            if (completionLock.current) return;
            completionLock.current = true;
            setCompleting(true);
            try {
              await completeRequestOffer(myOffer.id);
              Alert.alert('Tamamlandı', 'İş tamamlandı olarak işaretlendi.');
              void fetchData();
            } catch (err: any) {
              Alert.alert('Hata', err.message);
            } finally {
              completionLock.current = false;
              setCompleting(false);
            }
          },
        },
      ]
    );
  };

  if (fetching || !request) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{fetching ? 'Yükleniyor...' : loadError || 'Talep bulunamadı.'}</Text>
        {!fetching && <View style={{ padding: 24, gap: 12 }}><Button title="Tekrar Dene" onPress={fetchData} /><Button title="Geri" variant="outline" onPress={() => router.back()} /></View>}
      </View>
    );
  }

  const dateStr = new Date(request.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const isCompleted = request.status === 'completed';
  const hasAcceptedOffer = myOffer?.status === 'accepted';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>Geri</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Talep Detayı</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Durum banner */}
        {isCompleted && (
          <View style={styles.completedBanner}>
            <Text style={styles.completedBannerText}>✅ Bu iş tamamlandı</Text>
          </View>
        )}

        {request.display_image_url && (
          <Image source={{ uri: request.display_image_url }} style={styles.damageImage} />
        )}

        {/* Talep Bilgileri */}
        <View style={styles.card}>
          <Text style={styles.requestTitle}>{request.title}</Text>
          <Text style={styles.requestDescription}>{request.description}</Text>
          <View style={styles.detailRow}>
            <MapPinIcon size={14} color={COLORS.textSecondary} />
            <Text style={styles.detailText}>{request.damage_area || 'Bölge belirtilmemiş'}</Text>
          </View>
          <View style={styles.detailRow}>
            <ClockIcon size={14} color={COLORS.textSecondary} />
            <Text style={styles.detailText}>{dateStr}</Text>
          </View>
        </View>

        {/* AI Analiz Özeti */}
        {request.ai_summary && (
          <View style={styles.aiCard}>
            <Text style={styles.aiTitle}>Ön Analiz</Text>
            <Text style={styles.aiSummary}>{request.ai_summary}</Text>
            {request.urgency_level && (
              <View style={[
                styles.urgencyBadge,
                { backgroundColor: request.urgency_level === 'Yüksek' ? '#FEE2E2' : request.urgency_level === 'Orta' ? '#FEF3C7' : '#D1FAE5' }
              ]}>
                <Text style={[
                  styles.urgencyText,
                  { color: request.urgency_level === 'Yüksek' ? '#DC2626' : request.urgency_level === 'Orta' ? '#D97706' : '#059669' }
                ]}>
                  Aciliyet: {request.urgency_level}
                </Text>
              </View>
            )}
            <View style={styles.disclaimerRow}>
              <AlertIcon size={12} color={COLORS.warning} />
              <Text style={styles.disclaimerText}>Bu analiz ön bilgilendirme amaçlıdır.</Text>
            </View>
          </View>
        )}

        {/* Teklif durumu / gönder */}
        {offerSent ? (
          <View style={styles.offerSentCard}>
            <Text style={styles.offerSentText}>✅ Teklifiniz gönderildi</Text>
            {myOffer && (
              <Text style={styles.offerSentSubtext}>
                Fiyat: ₺{myOffer.price}
                {myOffer.estimated_delivery ? `  •  Süre: ${myOffer.estimated_delivery}` : ''}
              </Text>
            )}
            {/* İşi tamamla butonu — teklif kabul edildiyse veya teklif gönderildiyse */}
            {!isCompleted && hasAcceptedOffer && (
              <TouchableOpacity
                style={styles.completeBtn}
                onPress={handleMarkComplete}
                disabled={completing}
              >
                <Text style={styles.completeBtnText}>
                  {completing ? 'İşleniyor...' : '🏁 İşi Tamamlandı Olarak İşaretle'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Button
            title="Teklif Ver"
            variant="primary"
            size="lg"
            style={styles.offerButton}
            onPress={() => setOfferModalVisible(true)}
            disabled={!['pending', 'active'].includes(request.status)}
          />
        )}
      </ScrollView>

      {/* Teklif Modal */}
      <Modal visible={offerModalVisible} animationType="slide" transparent onRequestClose={() => { if (!sending.current) setOfferModalVisible(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20} style={styles.modalWrapper}>
          <View style={styles.modalOverlay}>
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Teklif Ver</Text>
              <Input label="Fiyat (₺)" placeholder="örn. 1500" keyboardType="numeric"
                value={price} onChangeText={setPrice} maxLength={12} />
              <Input label="Not (Opsiyonel)" placeholder="Müşteriye not bırak..."
                value={note} onChangeText={setNote} multiline numberOfLines={3} maxLength={2000} />
              <Input label="Tahmini Teslim Süresi" placeholder="örn. 3-5 iş günü"
                value={estimatedDelivery} onChangeText={setEstimatedDelivery} maxLength={120} />
              <View style={styles.modalActions}>
                <Button title="Vazgeç" variant="outline" size="md" style={{ flex: 1 }}
                  disabled={loading} onPress={() => setOfferModalVisible(false)} />
                <Button title="Gönder" variant="primary" size="md" loading={loading}
                  style={{ flex: 1 }} onPress={handleSendOffer} />
              </View>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingText: { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 100 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: 60, paddingBottom: SPACING.md,
    backgroundColor: COLORS.card, ...SHADOW.header, marginBottom: SPACING.md,
  },
  backText: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.textSecondary },
  headerTitle: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.text },
  completedBanner: {
    backgroundColor: '#D1FAE5', marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.md, alignItems: 'center',
  },
  completedBannerText: { fontFamily: FONTS.semibold, fontSize: 14, color: '#059669' },
  content: { paddingBottom: 48 },
  damageImage: { width: '100%', height: 220, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginHorizontal: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.card,
  },
  requestTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: COLORS.text, marginBottom: SPACING.sm },
  requestDescription: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.xs },
  detailText: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textSecondary },
  aiCard: {
    backgroundColor: COLORS.primary + '08', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginHorizontal: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.primary + '20',
  },
  aiTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.primary, marginBottom: SPACING.xs },
  aiSummary: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text, lineHeight: 22, marginBottom: SPACING.sm },
  urgencyBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.sm },
  urgencyText: { fontFamily: FONTS.semibold, fontSize: 12 },
  disclaimerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  disclaimerText: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textSecondary },
  offerButton: { marginHorizontal: SPACING.lg, width: 'auto' },
  offerSentCard: {
    backgroundColor: '#F0FDF4', borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginHorizontal: SPACING.lg, alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderColor: '#10B981',
  },
  offerSentText: { fontFamily: FONTS.semibold, fontSize: 16, color: '#059669' },
  offerSentSubtext: { fontFamily: FONTS.regular, fontSize: 13, color: '#065F46' },
  completeBtn: {
    backgroundColor: '#001E52', borderRadius: BORDER_RADIUS.md,
    paddingVertical: 14, paddingHorizontal: SPACING.lg,
    alignItems: 'center', marginTop: SPACING.sm, width: '100%',
  },
  completeBtnText: { fontFamily: FONTS.semibold, fontSize: 14, color: '#fff' },
  modalWrapper: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.card, borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.lg, paddingBottom: 40,
  },
  modalTitle: { fontFamily: FONTS.semibold, fontSize: 18, color: COLORS.text, marginBottom: SPACING.lg },
  modalActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
});
