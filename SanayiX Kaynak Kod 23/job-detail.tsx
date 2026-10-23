import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Alert, TextInput, RefreshControl,
  KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Circle, Polyline, Rect, Line, Polygon } from 'react-native-svg';
import { advanceRequestStep } from '../../lib/requestOffers';
import { supabase } from '../../lib/supabase';
import { FONTS, SHADOW } from '../../lib/constants';

const NAV = '#0F2167';
const AMBER = '#E07B00';
const GREEN = '#059669';

// ── SVG Icons ──
function IconBack({ size = 22, color = '#fff' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Svg>);
}
function IconCheck({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Polyline points="20 6 9 17 4 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></Svg>);
}
function IconCar({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v9a2 2 0 01-2 2h-2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><Circle cx="7" cy="17" r="2" stroke={color} strokeWidth="1.8" /><Circle cx="17" cy="17" r="2" stroke={color} strokeWidth="1.8" /></Svg>);
}
function IconSearch({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="11" cy="11" r="8" stroke={color} strokeWidth="1.8" /><Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} strokeWidth="1.8" strokeLinecap="round" /></Svg>);
}
function IconWrench({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>);
}
function IconSettings({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8" /><Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>);
}
function IconClipboard({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><Rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke={color} strokeWidth="1.8" /></Svg>);
}
function IconFlag({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><Line x1="4" y1="22" x2="4" y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round" /></Svg>);
}
function IconSend({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Line x1="22" y1="2" x2="11" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><Polygon points="22 2 15 22 11 13 2 9 22 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>);
}
function IconClock({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8" /><Polyline points="12 6 12 12 16 14" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>);
}
function IconUser({ size = 16, color = '#64748B' }: { size?: number; color?: string }) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><Circle cx="12" cy="7" r="4" stroke={color} strokeWidth="1.8" /></Svg>);
}

const STEPS = [
  { label: 'Randevu Onaylandı', Icon: IconCheck },
  { label: 'Araç Teslim Alındı', Icon: IconCar },
  { label: 'Genel Kontrol Yapıldı', Icon: IconSearch },
  { label: 'İşlem Başladı', Icon: IconWrench },
  { label: 'İşlem Devam Ediyor', Icon: IconSettings },
  { label: 'Kalite Kontrol', Icon: IconClipboard },
  { label: 'Tamamlandı', Icon: IconFlag },
];

export default function MechanicJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<any>(null);
  const [offer, setOffer] = useState<any>(null);
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newUpdate, setNewUpdate] = useState('');
  const [sending, setSending] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const advanceLock = useRef(false);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: req } = await supabase.from('damage_requests')
      .select('*, vehicles(brand,model,year,plate), profiles:profile_directory!user_id(full_name)')
      .eq('id', id).single();
    if (req) setRequest(req);

    const { data: off } = await supabase.from('offers')
      .select('*').eq('request_id', id).eq('mechanic_id', user.id).single();
    if (off) setOffer(off);

    const { data: upd } = await supabase.from('service_updates')
      .select('*').eq('request_id', id).order('created_at', { ascending: false });
    if (upd) setUpdates(upd);

    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sendUpdate = async () => {
    if (!newUpdate.trim() || sending) return;
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSending(false); return; }
    const { error } = await supabase.from('service_updates').insert({
      request_id: id, mechanic_id: user.id, message: newUpdate.trim(),
      step_number: request?.current_step || 0,
    });
    if (error) { Alert.alert('Hata', error.message); setSending(false); return; }
    setNewUpdate('');
    setSending(false);
    fetchData();
  };

  const advanceStep = async () => {
    if (advanceLock.current || offer?.status !== 'accepted') return;
    advanceLock.current = true;
    setAdvancing(true);
    try {
      const updated = await advanceRequestStep(offer.id, request?.current_step || 0);
      const isComplete = updated.status === 'completed';
      setRequest((previous: any) => ({ ...previous, ...updated }));

      if (isComplete) {
        Alert.alert('Tebrikler!', 'İş başarıyla tamamlandı.', [
          { text: 'Tamam', onPress: () => router.back() }
        ]);
      }

      fetchData();
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Bir hata oluştu.');
    } finally {
      advanceLock.current = false;
      setAdvancing(false);
    }
  };

  if (loading) return (<View style={s.center}><ActivityIndicator color={NAV} size="large" /></View>);
  if (!request) return (<View style={s.center}><Text style={{ fontFamily: FONTS.semibold, fontSize: 16, color: '#64748B' }}>İş bulunamadı</Text></View>);

  const currentStep = request.current_step || 0;
  const veh = request.vehicles;
  const owner = request.profiles;
  const isCompleted = request.status === 'completed';
  const price = offer?.price ? Number(offer.price) : 0;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <IconBack size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={s.headerSub}>SanayiX Usta</Text>
          <Text style={s.headerTitle}>İş Yönetimi</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }} contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={NAV} />}
      >
        {/* Job Info Card */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={[s.statusPill, { backgroundColor: isCompleted ? '#D1FAE5' : '#FEF3C7' }]}>
              <Text style={[s.statusPillText, { color: isCompleted ? GREEN : '#D97706' }]}>
                {isCompleted ? 'TAMAMLANDI' : 'AKTİF İŞ'}
              </Text>
            </View>
            {price > 0 && <Text style={s.priceTag}>{price.toLocaleString('tr-TR')} TL</Text>}
          </View>

          <Text style={s.jobTitle}>{request.title || request.damage_area || 'Genel Servis'}</Text>
          {veh && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <IconCar size={15} color="#475569" />
              <Text style={s.vehicleText}>{veh.brand} {veh.model} ({veh.year}){veh.plate ? ` • ${veh.plate}` : ''}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconUser size={15} color="#64748B" />
            <Text style={s.ownerText}>{owner?.full_name || 'Araç Sahibi'}</Text>
          </View>
        </View>

        {/* Step Progress */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>İŞLEM DURUMU</Text>
          <Text style={s.progressText}>Adım {currentStep} / {STEPS.length - 1}</Text>

          {/* Progress bar */}
          <View style={s.progressBarBg}>
            <View style={[s.progressBarFill, { width: `${(currentStep / (STEPS.length - 1)) * 100}%` }]} />
          </View>

          {/* Steps */}
          {STEPS.map((step, i) => {
            const isDone = i < currentStep;
            const isCurrent = i === currentStep;
            const StepIcon = step.Icon;
            const dotColor = isDone ? GREEN : isCurrent ? AMBER : '#E2E8F0';
            const iconColor = isDone ? '#fff' : isCurrent ? '#fff' : '#94A3B8';
            return (
              <View key={i} style={s.stepRow}>
                <View style={[s.stepDot, { backgroundColor: dotColor, borderColor: dotColor }]}>
                  {isDone ? <IconCheck size={14} color="#fff" /> : <StepIcon size={14} color={iconColor} />}
                </View>
                <Text style={[s.stepText, isDone && s.stepTextDone, isCurrent && s.stepTextCurrent]}>{step.label}</Text>
              </View>
            );
          })}

          {!isCompleted && currentStep < STEPS.length - 1 && (
            <TouchableOpacity
              style={[s.advanceBtn, advancing && { opacity: 0.6 }]}
              onPress={advanceStep}
              disabled={advancing}
              activeOpacity={0.85}
            >
              <Text style={s.advanceBtnText}>
                {advancing ? 'İşleniyor...' : `Sonraki Adıma Geç → ${STEPS[currentStep + 1]?.label}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Send Update */}
        {!isCompleted && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>CANLI GÜNCELLEME GÖNDER</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <IconClock size={13} color="#94A3B8" />
              <Text style={s.hintText}>İşlemin durumunu müşterinle paylaş.</Text>
            </View>
            <TextInput
              style={s.input}
              placeholder="ör: Yağ ve filtre değişimi başladı"
              value={newUpdate}
              onChangeText={setNewUpdate}
              placeholderTextColor="#94A3B8"
              multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, (!newUpdate.trim() || sending) && { opacity: 0.5 }]}
              onPress={sendUpdate}
              disabled={!newUpdate.trim() || sending}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSend size={16} color="#fff" />
                <Text style={s.sendBtnText}>{sending ? 'Gönderiliyor...' : 'Güncelleme Gönder'}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Update Timeline */}
        {updates.length > 0 && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <IconClock size={18} color={NAV} />
              <Text style={s.sectionLabel2}>GEÇMİŞ GÜNCELLEMELER</Text>
            </View>
            {updates.map((u, i) => {
              const t = new Date(u.created_at);
              const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
              const isFirst = i === 0;
              return (
                <View key={u.id} style={s.updateRow}>
                  <View style={s.timelineCol}>
                    <View style={[s.timelineDot, isFirst && s.timelineDotActive]} />
                    {i < updates.length - 1 && <View style={s.timelineLine} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 14 }}>
                    <Text style={s.updateTime}>{timeStr}</Text>
                    <Text style={[s.updateMsg, isFirst && { fontFamily: FONTS.extrabold, color: '#111827' }]}>{u.message}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F2F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F8' },
  header: {
    backgroundColor: NAV, paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 14, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontFamily: FONTS.medium, fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  headerTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#fff' },
  content: { padding: 20 },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 14, ...SHADOW.card },
  sectionLabel: { fontFamily: FONTS.semibold, fontSize: 10, color: '#94A3B8', letterSpacing: 1.2, marginBottom: 4 },
  sectionLabel2: { fontFamily: FONTS.extrabold, fontSize: 13, color: '#111827', letterSpacing: 0.5 },
  hintText: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8' },

  statusPill: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  statusPillText: { fontFamily: FONTS.extrabold, fontSize: 10, letterSpacing: 0.5 },
  priceTag: { fontFamily: FONTS.extrabold, fontSize: 18, color: NAV },

  jobTitle: { fontFamily: FONTS.extrabold, fontSize: 20, color: '#111827', marginBottom: 10 },
  vehicleText: { fontFamily: FONTS.medium, fontSize: 14, color: '#475569' },
  ownerText: { fontFamily: FONTS.medium, fontSize: 13, color: '#64748B' },

  progressText: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#111827', marginBottom: 10 },
  progressBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginBottom: 18 },
  progressBarFill: { height: 6, backgroundColor: AMBER, borderRadius: 3 },

  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  stepDot: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  stepText: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', marginLeft: 12, flex: 1 },
  stepTextDone: { color: GREEN, textDecorationLine: 'line-through' },
  stepTextCurrent: { fontFamily: FONTS.extrabold, color: '#111827' },

  advanceBtn: { backgroundColor: AMBER, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  advanceBtnText: { fontFamily: FONTS.extrabold, fontSize: 14, color: '#fff' },

  input: {
    backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: FONTS.regular, fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#E2E8F0',
    marginBottom: 10, minHeight: 56, textAlignVertical: 'top',
  },
  sendBtn: { backgroundColor: NAV, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sendBtnText: { fontFamily: FONTS.extrabold, fontSize: 15, color: '#fff' },

  updateRow: { flexDirection: 'row' },
  timelineCol: { width: 24, alignItems: 'center', marginRight: 12 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#CBD5E1', marginTop: 4 },
  timelineDotActive: { backgroundColor: AMBER, width: 14, height: 14, borderRadius: 7 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0', marginTop: 4 },
  updateTime: { fontFamily: FONTS.medium, fontSize: 12, color: '#94A3B8', marginBottom: 2 },
  updateMsg: { fontFamily: FONTS.semibold, fontSize: 14, color: '#475569' },
});
