import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { decideRequestOffer, formatQuotedAmount } from '../../lib/requestOffers';
import { supabase } from '../../lib/supabase';
import { FONTS, SPACING, SHADOW } from '../../lib/constants';
import BottomNavBar from '../../components/BottomNavBar';

const NAV = '#001E52';
const AMBER = '#E07B00';

function IconBack({ size = 22, color = NAV }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<any>(null);
  const [mechanic, setMechanic] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const actionLock = useRef(false);

  useEffect(() => { fetchOffer(); }, []);

  const fetchOffer = async () => {
    const { data } = await supabase
      .from('offers')
      .select('*, damage_requests(id, title, description, damage_area, vehicles(brand, model, year))')
      .eq('id', id)
      .single();
    if (data) {
      setOffer(data);
      // Fetch mechanic profile
      const { data: mech } = await supabase
        .from('mechanic_directory')
        .select('*')
        .eq('user_id', data.mechanic_id)
        .single();
      if (mech) setMechanic(mech);
      // Fetch reviews
      const { data: revs } = await supabase
        .from('reviews')
        .select('*, profiles:profile_directory!user_id(full_name)')
        .eq('mechanic_id', data.mechanic_id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (revs) setReviews(revs);
    }
    setLoading(false);
  };

  const handleAccept = () => {
    if (!mechanic) return;
    // Usta profiline yönlendir, oradan teklifi kabul edecek
    router.push(`/user/mechanic-profile?id=${mechanic.user_id}&offerId=${id}` as any);
  };

  const handleReject = async () => {
    Alert.alert('Teklifi Reddet', 'Bu teklifi reddetmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Reddet', style: 'destructive', onPress: async () => {
          if (actionLock.current) return;
          actionLock.current = true;
          setActionLoading(true);
          try {
            await decideRequestOffer(id, 'rejected');
            await fetchOffer();
          } catch (err: any) { Alert.alert('Hata', err.message || 'Teklif reddedilemedi.'); }
          finally { actionLock.current = false; setActionLoading(false); }
        }
      }
    ]);
  };

  const handleMessage = async () => {
    if (!mechanic) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: existing } = await supabase
      .from('conversations').select('id')
      .eq('user_id', user.id).eq('mechanic_id', mechanic.user_id).single();
    if (existing) {
      router.push(`/user/chat?conversationId=${existing.id}&name=${encodeURIComponent(mechanic.full_name)}` as any);
    } else {
      const { data: newConvo } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, mechanic_id: mechanic.user_id, service_category: mechanic.specialty })
        .select('id').single();
      if (newConvo) router.push(`/user/chat?conversationId=${newConvo.id}&name=${encodeURIComponent(mechanic.full_name)}` as any);
    }
  };

  if (loading) return (
    <View style={s.center}><ActivityIndicator color={NAV} size="large" /></View>
  );
  if (!offer) return (
    <View style={s.center}>
      <Text style={{ fontSize: 48 }}>🔍</Text>
      <Text style={s.emptyTitle}>Teklif bulunamadı</Text>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={{ color: NAV, fontFamily: FONTS.semibold, fontSize: 15 }}>Geri Dön</Text>
      </TouchableOpacity>
    </View>
  );

  const dr = offer.damage_requests;
  const v = dr?.vehicles;
  const availLabel = mechanic?.availability_status === 'busy' ? 'Yoğun' : mechanic?.availability_status === 'closed' ? 'Kapalı' : 'Bugün müsait';
  const availColor = mechanic?.availability_status === 'busy' ? '#B45309' : mechanic?.availability_status === 'closed' ? '#DC2626' : '#059669';

  // Price breakdown
  const totalPrice = Number(offer.price) || 0;
  const laborPrice = formatQuotedAmount(offer.labor_cost);
  const partsPrice = formatQuotedAmount(offer.parts_cost);
  const servicePrice = 'Belirtilmedi';


  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <IconBack size={22} color={NAV} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Offer Details</Text>
        <TouchableOpacity><Text style={{ fontSize: 20 }}>⋮</Text></TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <Text style={s.pageTitle}>Teklif Detayı</Text>
        <Text style={s.pageSub}>Ustanın verdiği teklifi inceleyin.</Text>

        {/* Mechanic Card */}
        {mechanic && (
          <TouchableOpacity
            style={s.mechCard}
            activeOpacity={0.85}
            onPress={() => router.push(`/user/mechanic-profile?id=${mechanic.user_id}` as any)}
          >
            <View style={s.mechAvatar}>
              <Text style={s.mechAvatarText}>{mechanic.full_name?.charAt(0)?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mechName}>{mechanic.full_name}</Text>
              <Text style={s.mechSpec}>{mechanic.specialty?.toUpperCase()} UZMANI</Text>
            </View>
            {mechanic.rating ? (
              <View style={s.ratingBadge}>
                <Text style={s.ratingText}>★ {Number(mechanic.rating).toFixed(1)}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}

        {/* Stats row */}
        {mechanic && (
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statLabel}>DEĞERLENDİRME</Text>
              <Text style={s.statValue}>{mechanic.review_count || 0} adet</Text>
            </View>
            <View style={s.statItem}>
              <Text style={s.statLabel}>UZAKLIK</Text>
              <Text style={s.statValue}>—</Text>
            </View>
            <View style={s.statItem}>
              <Text style={s.statLabel}>DURUM</Text>
              <Text style={[s.statValue, { color: availColor }]}>{availLabel}</Text>
            </View>
          </View>
        )}

        {/* SEÇİLEN PROBLEM + GARANTİ */}
        <View style={s.twoCards}>
          <View style={[s.infoBox, { flex: 1 }]}>
            <Text style={s.infoBoxLabel}>SEÇİLEN PROBLEM</Text>
            <Text style={s.infoBoxValue}>{dr?.damage_area || mechanic?.specialty || 'Genel'}</Text>
            <Text style={s.infoBoxSub}>{dr?.title || 'Hasar Talebi'}</Text>
          </View>
          <View style={[s.infoBox, { flex: 1 }]}>
            <Text style={s.infoBoxLabel}>GARANTİ BİLGİSİ</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 14 }}>🛡️</Text>
              <Text style={s.infoBoxValue}>{offer.warranty || 'Belirtilmedi'}</Text>
            </View>
            <Text style={s.infoBoxSub}>Garanti kapsamını ustaya sorabilirsiniz.</Text>
          </View>
        </View>

        {/* TAHMİNİ FİYAT ARALIĞI */}
        <View style={s.priceHeroCard}>
          <Text style={s.priceHeroLabel}>TOPLAM TEKLİF</Text>
          <Text style={s.priceHeroValue}>{totalPrice.toLocaleString('tr-TR')} <Text style={{ fontSize: 20 }}>TL</Text></Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Text style={{ fontSize: 13 }}>⚙</Text>
            <Text style={s.priceHeroSub}>Parça ve işçilik dahil</Text>
          </View>

          {/* Breakdown */}
          <View style={s.breakdownRow}>
            <Text style={s.breakdownLabel}>İşçilik</Text>
            <Text style={s.breakdownValue}>{laborPrice}</Text>
          </View>
          <View style={s.breakdownRow}>
            <Text style={s.breakdownLabel}>Parça / Malzeme</Text>
            <Text style={s.breakdownValue}>{partsPrice}</Text>
          </View>
          <View style={s.breakdownRow}>
            <Text style={s.breakdownLabel}>Servis Bedeli</Text>
            <Text style={s.breakdownValue}>{servicePrice}</Text>
          </View>
          <View style={[s.breakdownRow, { borderBottomWidth: 0, marginTop: 4 }]}>
            <Text style={[s.breakdownLabel, { fontFamily: FONTS.extrabold, color: '#fff', fontSize: 16 }]}>Toplam</Text>
            <Text style={[s.breakdownValue, { fontFamily: FONTS.extrabold, fontSize: 16 }]}>{totalPrice.toLocaleString('tr-TR')} TL</Text>
          </View>
          <Text style={s.priceDisclaimer}>
            Teklif kapsamını ve ek işlem koşullarını ustayla netleştirin.
          </Text>
        </View>

        {/* Randevu Önerisi */}
        <View style={s.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Text style={{ fontSize: 18 }}>📅</Text>
            <Text style={s.sectionTitle}>Randevu Önerisi</Text>
          </View>
          <Text style={s.infoBoxSub}>{offer.estimated_delivery || 'Randevu ve teslim süresini ustayla belirleyin.'}</Text>
        </View>

        {/* Ustanın Notu */}
        {(offer.message || offer.status_note) && (
          <View style={s.section}>
            <Text style={s.noteSectionLabel}>USTANIN NOTU</Text>
            <View style={s.noteCard}>
              <Text style={s.noteText}>"{offer.message || offer.status_note}"</Text>
              <Text style={s.noteQuote}>❝</Text>
            </View>
          </View>
        )}

        {/* Garanti banner */}
        <View style={s.warrantyBanner}>
          <View style={s.warrantyIcon}>
            <Text style={{ fontSize: 20 }}>🛡️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.warrantyTitle}>{offer.warranty || 'Garanti bilgisi belirtilmedi'}</Text>
            <Text style={s.warrantySub}>Garanti kapsamı yapılan işleme göre değişebilir.</Text>
          </View>
        </View>

        {/* Son Değerlendirmeler */}
        {reviews.length > 0 && (
          <View style={s.section}>
            <Text style={s.noteSectionLabel}>SON DEĞERLENDİRMELER</Text>
            {reviews.map((rev, i) => (
              <View key={rev.id || i} style={s.reviewCard}>
                <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                  {[1,2,3,4,5].map(star => (
                    <Text key={star} style={{ color: star <= rev.rating ? '#D97706' : '#E2E8F0', fontSize: 16 }}>★</Text>
                  ))}
                </View>
                <Text style={s.reviewText}>"{rev.comment || 'Memnun kaldım.'}"</Text>
              </View>
            ))}
          </View>
        )}

        {/* CTA Buttons */}
        {offer.status === 'pending' && (
          <View style={{ gap: 12, marginTop: 8, marginBottom: 30 }}>
            <TouchableOpacity style={s.acceptBtn} onPress={handleAccept} disabled={actionLoading} activeOpacity={0.85}>
              <Text style={s.acceptBtnText}>{actionLoading ? 'İşleniyor...' : 'Teklifi Kabul Et'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.messageBtn} onPress={handleMessage} activeOpacity={0.85}>
              <Text style={s.messageBtnText}>📋 Mesaj Gönder</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReject} activeOpacity={0.85}>
              <Text style={s.rejectText}>Teklifi Reddet</Text>
            </TouchableOpacity>
          </View>
        )}

        {offer.status === 'accepted' && (
          <View style={{ gap: 12, marginTop: 8, marginBottom: 30 }}>
            <View style={s.acceptedBanner}>
              <Text style={s.acceptedBannerText}>✅ Bu teklif kabul edildi</Text>
            </View>
            <TouchableOpacity style={s.messageBtn} onPress={handleMessage} activeOpacity={0.85}>
              <Text style={s.messageBtnText}>📋 Mesaj Gönder</Text>
            </TouchableOpacity>
          </View>
        )}

        {offer.status === 'rejected' && (
          <View style={{ marginTop: 8, marginBottom: 30 }}>
            <View style={[s.acceptedBanner, { backgroundColor: '#FEE2E2' }]}>
              <Text style={[s.acceptedBannerText, { color: '#DC2626' }]}>❌ Bu teklif reddedildi</Text>
            </View>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <BottomNavBar activeTab="offers" />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F2F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F8' },
  emptyTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#1E293B', marginTop: 12, marginBottom: 12 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 12, paddingHorizontal: 20,
    backgroundColor: '#F0F2F8',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: '#1E293B' },
  content: { padding: 20, paddingBottom: 20 },

  pageTitle: { fontFamily: FONTS.extrabold, fontSize: 32, color: '#111827', marginBottom: 4 },
  pageSub: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', marginBottom: 20 },

  // Mechanic Card
  mechCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 14,
    ...SHADOW.card,
  },
  mechAvatar: {
    width: 60, height: 60, borderRadius: 16, backgroundColor: '#1E3A5F',
    alignItems: 'center', justifyContent: 'center',
  },
  mechAvatarText: { fontFamily: FONTS.extrabold, fontSize: 24, color: '#fff' },
  mechName: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#111827' },
  mechSpec: { fontFamily: FONTS.semibold, fontSize: 11, color: '#94A3B8', letterSpacing: 0.5 },
  ratingBadge: {
    backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  ratingText: { fontFamily: FONTS.extrabold, fontSize: 14, color: '#D97706' },

  // Stats
  statsRow: { flexDirection: 'row', marginBottom: 14 },
  statItem: { flex: 1 },
  statLabel: { fontFamily: FONTS.semibold, fontSize: 9, color: '#94A3B8', letterSpacing: 0.8, marginBottom: 4 },
  statValue: { fontFamily: FONTS.extrabold, fontSize: 14, color: '#111827' },

  // Two cards
  twoCards: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  infoBox: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, ...SHADOW.card,
  },
  infoBoxLabel: { fontFamily: FONTS.semibold, fontSize: 9, color: '#94A3B8', letterSpacing: 0.8, marginBottom: 8 },
  infoBoxValue: { fontFamily: FONTS.extrabold, fontSize: 15, color: '#111827' },
  infoBoxSub: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // Price hero
  priceHeroCard: {
    backgroundColor: NAV, borderRadius: 22, padding: 22, marginBottom: 20,
  },
  priceHeroLabel: { fontFamily: FONTS.semibold, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2 },
  priceHeroValue: { fontFamily: FONTS.extrabold, fontSize: 38, color: '#fff', marginTop: 4 },
  priceHeroSub: { fontFamily: FONTS.semibold, fontSize: 13, color: AMBER },
  breakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  breakdownLabel: { fontFamily: FONTS.regular, fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  breakdownValue: { fontFamily: FONTS.semibold, fontSize: 14, color: '#fff' },
  priceDisclaimer: { fontFamily: FONTS.regular, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12 },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#111827' },

  // Time slots
  timeSlotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeSlot: {
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18,
    borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff',
  },
  timeSlotActive: { backgroundColor: NAV, borderColor: NAV },
  timeSlotText: { fontFamily: FONTS.semibold, fontSize: 13, color: '#64748B' },
  timeSlotTextActive: { color: '#fff' },

  // Note
  noteSectionLabel: { fontFamily: FONTS.semibold, fontSize: 10, color: '#94A3B8', letterSpacing: 1.2, marginBottom: 12 },
  noteCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, position: 'relative',
    ...SHADOW.card,
  },
  noteText: { fontFamily: FONTS.medium, fontSize: 16, color: '#374151', lineHeight: 26, fontStyle: 'italic' },
  noteQuote: { position: 'absolute', top: 12, right: 20, fontSize: 40, color: '#E2E8F0' },

  // Reviews
  reviewCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 10,
    ...SHADOW.card,
  },
  reviewText: { fontFamily: FONTS.regular, fontSize: 14, color: '#475569', lineHeight: 22 },

  // Warranty
  warrantyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 20,
    ...SHADOW.card,
  },
  warrantyIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  warrantyTitle: { fontFamily: FONTS.extrabold, fontSize: 15, color: '#111827' },
  warrantySub: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // CTA
  acceptBtn: {
    backgroundColor: AMBER, borderRadius: 18, paddingVertical: 20, alignItems: 'center',
  },
  acceptBtnText: { fontFamily: FONTS.extrabold, fontSize: 17, color: '#fff' },
  messageBtn: {
    backgroundColor: '#fff', borderRadius: 18, paddingVertical: 18, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  messageBtnText: { fontFamily: FONTS.extrabold, fontSize: 16, color: NAV },
  rejectText: {
    fontFamily: FONTS.semibold, fontSize: 15, color: '#DC2626', textAlign: 'center',
    paddingVertical: 12,
  },
  acceptedBanner: {
    backgroundColor: '#D1FAE5', borderRadius: 16, paddingVertical: 16, alignItems: 'center',
  },
  acceptedBannerText: { fontFamily: FONTS.extrabold, fontSize: 15, color: '#059669' },
});
