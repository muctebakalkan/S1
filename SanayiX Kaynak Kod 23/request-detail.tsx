import React, { useCallback, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Platform, Alert, Image,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
import { decideRequestOffer, listRequestOffers } from '../../lib/requestOffers';
import { supabase } from '../../lib/supabase';
import { resolveDamageImageUrl } from '../../lib/damageImages';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../../lib/constants';

const NAV_BLUE = '#001E52';

function IconBack({ size = 22, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const STATUS_MAP: Record<string, { label: string; bg: string; color: string; emoji: string }> = {
  pending:   { label: 'Bekliyor',    bg: '#FEF3C7', color: '#D97706', emoji: '⏳' },
  active:    { label: 'Aktif',       bg: '#DBEAFE', color: '#2563EB', emoji: '🔧' },
  completed: { label: 'Tamamlandı', bg: '#D1FAE5', color: '#059669', emoji: '✅' },
  cancelled: { label: 'İptal',      bg: '#FEE2E2', color: '#DC2626', emoji: '❌' },
};

const OFFER_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending:  { label: 'Bekliyor', bg: '#FEF3C7', color: '#D97706' },
  accepted: { label: 'Kabul Edildi', bg: '#D1FAE5', color: '#059669' },
  rejected: { label: 'Reddedildi', bg: '#FEE2E2', color: '#DC2626' },
};

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);
  const actionLock = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchDetail = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setLoadError('');
    try {
      const [reqResult, rows] = await Promise.all([
        supabase.from('damage_requests').select('*, vehicles(brand,model,year,plate)').eq('id', id).maybeSingle(),
        listRequestOffers(id),
      ]);
      if (reqResult.error) throw reqResult.error;
      if (!reqResult.data) throw new Error('Talep bulunamadı veya görüntüleme izniniz yok.');
      const image = await resolveDamageImageUrl(reqResult.data.image_url);
      if (version !== loadVersion.current) return;
      setRequest({ ...reqResult.data, display_image_url: image });
      setOffers(rows);
    } catch (err: any) {
      if (version === loadVersion.current) {
        setRequest(null); setOffers([]);
        setLoadError(err.message || 'Talep ve teklifler yüklenemedi.');
      }
    } finally {
      if (version === loadVersion.current) {
        setLoading(false);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
    }
  }, [id, fadeAnim]);

  useFocusEffect(useCallback(() => {
    void fetchDetail();
    return () => { loadVersion.current += 1; };
  }, [fetchDetail]));

  const handleAcceptOffer = async (offerId: string) => {
    Alert.alert('Teklifi Kabul Et', 'Bu teklifi kabul etmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Kabul Et', onPress: async () => {
        if (actionLock.current) return;
        actionLock.current = true;
        try {
          await decideRequestOffer(offerId, 'accepted');
          router.push({ pathname: '/user/appointment' as any, params: { id } });
        } catch (err: any) {
          Alert.alert('Hata', err.message || 'Teklif kabul edilemedi.');
        } finally { actionLock.current = false; }
      }},
    ]);
  };

  const handleRejectOffer = async (offerId: string) => {
    if (actionLock.current) return;
    actionLock.current = true;
    try {
      await decideRequestOffer(offerId, 'rejected');
      await fetchDetail();
    } catch (err: any) { Alert.alert('Hata', err.message || 'Teklif reddedilemedi.'); }
    finally { actionLock.current = false; }
  };

  const handleCancelRequest = () => {
    Alert.alert('Talebi İptal Et', 'Talebi iptal etmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal Et', style: 'destructive', onPress: async () => {
        if (actionLock.current) return;
        actionLock.current = true;
        try {
          const { error } = await supabase.from('damage_requests').update({ status: 'cancelled' }).eq('id', id).select('id').single();
          if (error) throw error;
          await fetchDetail();
        } catch (err: any) { Alert.alert('Hata', err.message || 'Talep iptal edilemedi.'); }
        finally { actionLock.current = false; }
      }},
    ]);
  };

  if (loading) return (
    <View style={s.center}><ActivityIndicator color={NAV_BLUE} size="large" /></View>
  );

  if (!request) return (
    <View style={s.center}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>
      <Text style={s.emptyTitle}>{loadError || 'Talep bulunamadı'}</Text>
      <TouchableOpacity style={s.altBtn} onPress={fetchDetail} accessibilityRole="button" accessibilityLabel="Tekrar Dene"><Text style={{color:NAV_BLUE}}>Tekrar Dene</Text></TouchableOpacity>
      <TouchableOpacity style={s.altBtn} onPress={() => router.back()}>
        <Text style={s.altBtnText}>Geri Dön</Text>
      </TouchableOpacity>
    </View>
  );

  const status = STATUS_MAP[request.status] || STATUS_MAP.pending;
  const veh = request.vehicles;
  const date = new Date(request.created_at);

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <IconBack size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Talep Detayı</Text>
        <View style={{ width: 36 }} />
      </View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeAnim }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Durum Banner */}
        <View style={[s.statusBanner, { backgroundColor: status.bg, borderLeftColor: status.color }]}>
          <Text style={{ fontSize: 28 }}>{status.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusTitle, { color: status.color }]}>{status.label}</Text>
            <Text style={s.statusDate}>
              {date.toLocaleDateString('tr-TR')} · {date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>

        {request.display_image_url && (
          <Image source={{ uri: request.display_image_url }} style={s.damageImage} resizeMode="cover" />
        )}

        {/* Talep Bilgileri */}
        <View style={s.card}>
          <Text style={s.cardLabel}>TALEP</Text>
          <Text style={s.requestTitle}>{request.title}</Text>
          {request.description && (
            <Text style={s.requestDesc}>{request.description}</Text>
          )}

          <View style={s.detailRow}>
            {request.damage_area && (
              <View style={s.detailPill}>
                <Text style={s.detailPillText}>📍 {request.damage_area}</Text>
              </View>
            )}
            {request.urgency_level && (
              <View style={[s.detailPill, {
                backgroundColor: request.urgency_level === 'Yüksek' ? '#FEE2E2'
                  : request.urgency_level === 'Orta' ? '#FEF3C7' : '#D1FAE5'
              }]}>
                <Text style={[s.detailPillText, {
                  color: request.urgency_level === 'Yüksek' ? '#DC2626'
                    : request.urgency_level === 'Orta' ? '#D97706' : '#059669'
                }]}>⚡ {request.urgency_level}</Text>
              </View>
            )}
            {request.recommended_specialty && (
              <View style={s.detailPill}>
                <Text style={s.detailPillText}>🔧 {request.recommended_specialty}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Araç Bilgisi */}
        {veh && (
          <View style={s.vehicleCard}>
            <View style={s.vehicleIcon}>
              <Text style={{ fontSize: 22 }}>🚗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.vehicleBrand}>{veh.brand} {veh.model}</Text>
              <Text style={s.vehicleInfo}>{veh.year}{veh.plate ? ` · ${veh.plate}` : ''}</Text>
            </View>
          </View>
        )}

        {/* AI Özeti */}
        {request.ai_summary && (
          <View style={s.aiCard}>
            <View style={s.aiHeader}>
              <Text style={{ fontSize: 18 }}>✦</Text>
              <Text style={s.aiLabel}>AI Ön Analiz</Text>
            </View>
            <Text style={s.aiText}>{request.ai_summary}</Text>
          </View>
        )}

        {/* Teklifler */}
        <Text style={s.sectionTitle}>Gelen Teklifler ({offers.length})</Text>
        {offers.length === 0 ? (
          <View style={s.emptyOffers}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>📭</Text>
            <Text style={s.emptyOffersText}>Henüz teklif gelmedi</Text>
            <Text style={s.emptyOffersSub}>Ustalar talebinizi incelediğinde teklif gelecektir.</Text>
          </View>
        ) : (
          offers.map(offer => {
            const offerSt = OFFER_STATUS[offer.status] || OFFER_STATUS.pending;
            const mech = offer.mechanic_profiles;
            const tierConf = mech?.tier === 'premium'
              ? { label: '⭐ Premium', bg: '#FEF3C7', col: '#D97706' }
              : mech?.tier === 'approved'
              ? { label: '✅ Onaylı', bg: '#D1FAE5', col: '#059669' }
              : { label: '🆕 Yeni', bg: '#F3F4F6', col: '#6B7280' };

            return (
              <View key={offer.id} style={s.offerCard}>
                <View style={s.offerHeader}>
                  <View style={s.offerAvatar}>
                    <Text style={s.offerAvatarText}>{mech?.full_name?.charAt(0) || '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.offerName}>{mech?.full_name || 'Usta'}</Text>
                      <View style={[s.tierPill, { backgroundColor: tierConf.bg }]}>
                        <Text style={[s.tierText, { color: tierConf.col }]}>{tierConf.label}</Text>
                      </View>
                    </View>
                    <Text style={s.offerLocation}>{mech?.district}, {mech?.city}</Text>
                    {mech?.rating && (
                      <Text style={s.offerRating}>★ {Number(mech.rating).toFixed(1)}</Text>
                    )}
                  </View>
                  <View style={[s.offerStatusBadge, { backgroundColor: offerSt.bg }]}>
                    <Text style={[s.offerStatusText, { color: offerSt.color }]}>{offerSt.label}</Text>
                  </View>
                </View>

                {/* Teklif detayları */}
                <View style={s.offerDetails}>
                  {offer.price && (
                    <View style={s.offerDetailItem}>
                      <Text style={s.offerDetailLabel}>Fiyat</Text>
                      <Text style={s.offerDetailValue}>₺{Number(offer.price).toLocaleString('tr-TR')}</Text>
                    </View>
                  )}
                  {offer.estimated_delivery && (
                    <View style={s.offerDetailItem}>
                      <Text style={s.offerDetailLabel}>Teslim</Text>
                      <Text style={s.offerDetailValue}>{offer.estimated_delivery}</Text>
                    </View>
                  )}
                </View>
                {offer.note && (
                  <View style={s.offerNote}>
                    <Text style={s.offerNoteText}>"{offer.note}"</Text>
                  </View>
                )}

                {/* Aksiyon Butonları */}
                {offer.status === 'pending' && request.status === 'pending' && (
                  <View style={s.offerActions}>
                    <TouchableOpacity
                      style={s.rejectBtn}
                      onPress={() => handleRejectOffer(offer.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.rejectBtnText}>Reddet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.acceptBtn}
                      onPress={() => handleAcceptOffer(offer.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={s.acceptBtnText}>Kabul Et</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Tamamlanan iş — değerlendir */}
                {offer.status === 'accepted' && offer.completed_at && !offer.reviewed && (
                  <TouchableOpacity
                    style={s.reviewBtn}
                    onPress={() => router.push({
                      pathname: '/user/rate-mechanic' as any,
                      params: {
                        offerId: offer.id,
                        mechanicId: offer.mechanic_id,
                        requestTitle: request.title,
                      },
                    })}
                    activeOpacity={0.85}
                  >
                    <Text style={s.reviewBtnText}>⭐ Değerlendir</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* İptal butonu */}
        {(request.status === 'pending' || request.status === 'active') && (
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancelRequest} activeOpacity={0.85}>
            <Text style={s.cancelBtnText}>Talebi İptal Et</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F8' },
  damageImage: { width: '100%', height: 220, borderRadius: 18, marginBottom: 16, backgroundColor: '#E5E7EB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F8', padding: 32 },
  emptyTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#1E293B', marginBottom: 16 },
  altBtn: { backgroundColor: NAV_BLUE, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  altBtnText: { fontFamily: FONTS.semibold, fontSize: 15, color: '#fff' },

  header: {
    backgroundColor: NAV_BLUE, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 16,
    paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },

  content: { padding: SPACING.lg },

  // Status Banner
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    borderRadius: 16, padding: SPACING.md, marginBottom: SPACING.md,
    borderLeftWidth: 4,
  },
  statusTitle: { fontFamily: FONTS.extrabold, fontSize: 18, marginBottom: 2 },
  statusDate: { fontFamily: FONTS.regular, fontSize: 12, color: '#64748B' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: SPACING.lg,
    marginBottom: SPACING.md, ...SHADOW.card,
  },
  cardLabel: { fontFamily: FONTS.semibold, fontSize: 10, color: '#94A3B8', letterSpacing: 1.2, marginBottom: 6 },
  requestTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#1E293B', marginBottom: 8 },
  requestDesc: { fontFamily: FONTS.regular, fontSize: 14, color: '#64748B', lineHeight: 22, marginBottom: 12 },
  detailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailPill: {
    backgroundColor: '#F0F4FF', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  detailPillText: { fontFamily: FONTS.medium, fontSize: 12, color: '#2563EB' },

  // Vehicle
  vehicleCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginBottom: SPACING.md, ...SHADOW.card,
  },
  vehicleIcon: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: '#F0F4FF',
    alignItems: 'center', justifyContent: 'center',
  },
  vehicleBrand: { fontFamily: FONTS.semibold, fontSize: 15, color: '#1E293B', marginBottom: 2 },
  vehicleInfo: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8' },

  // AI
  aiCard: {
    backgroundColor: '#0F2167', borderRadius: 16, padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  aiLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  aiText: { fontFamily: FONTS.regular, fontSize: 14, color: '#fff', lineHeight: 22 },

  // Section
  sectionTitle: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#1E293B', marginBottom: SPACING.md },

  // Empty Offers
  emptyOffers: {
    backgroundColor: '#fff', borderRadius: 18, padding: SPACING.xl,
    alignItems: 'center', ...SHADOW.card, marginBottom: SPACING.md,
  },
  emptyOffersText: { fontFamily: FONTS.semibold, fontSize: 16, color: '#1E293B', marginBottom: 4 },
  emptyOffersSub: { fontFamily: FONTS.regular, fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  // Offer Card
  offerCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: SPACING.md,
    marginBottom: 12, ...SHADOW.card,
  },
  offerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  offerAvatar: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#1E1E2E',
    alignItems: 'center', justifyContent: 'center',
  },
  offerAvatarText: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },
  offerName: { fontFamily: FONTS.semibold, fontSize: 15, color: '#1E293B' },
  offerLocation: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8', marginTop: 2 },
  offerRating: { fontFamily: FONTS.semibold, fontSize: 12, color: '#D97706', marginTop: 2 },
  tierPill: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  tierText: { fontFamily: FONTS.semibold, fontSize: 10 },
  offerStatusBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  offerStatusText: { fontFamily: FONTS.semibold, fontSize: 11 },

  offerDetails: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  offerDetailItem: {},
  offerDetailLabel: { fontFamily: FONTS.medium, fontSize: 11, color: '#94A3B8', marginBottom: 2 },
  offerDetailValue: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#1E293B' },

  offerNote: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: SPACING.sm,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#E2E8F0',
  },
  offerNoteText: { fontFamily: FONTS.regular, fontSize: 13, color: '#64748B', fontStyle: 'italic' },

  offerActions: { flexDirection: 'row', gap: 10 },
  rejectBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  rejectBtnText: { fontFamily: FONTS.semibold, fontSize: 14, color: '#64748B' },
  acceptBtn: {
    flex: 2, backgroundColor: '#059669', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  acceptBtnText: { fontFamily: FONTS.semibold, fontSize: 14, color: '#fff' },

  reviewBtn: {
    backgroundColor: '#FEF3C7', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#F59E0B',
  },
  reviewBtnText: { fontFamily: FONTS.semibold, fontSize: 14, color: '#92400E' },

  cancelBtn: {
    backgroundColor: '#FEE2E2', borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: SPACING.md,
  },
  cancelBtnText: { fontFamily: FONTS.semibold, fontSize: 15, color: '#DC2626' },
});
