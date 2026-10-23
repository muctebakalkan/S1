import SanayixLogo from '../../components/SanayixLogo';
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { setCustomerRegistrationDraft } from '../../lib/registrationDraft';
import { validateAuthEmail } from '../../lib/authLinks';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
import { FONTS, BORDER_RADIUS } from '../../lib/constants';

const NAV_BLUE = '#001E52';
const AMBER = '#E07B00';

// ── İkonlar ──────────────────────────────────────────────────
function IconBack({ size = 22, color = '#1E293B' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function IconProfile({ size = 22, color = '#1E293B' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth="2" />
    </Svg>
  );
}
function IconEye({ size = 20, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth="2" />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
    </Svg>
  );
}
function IconEyeOff({ size = 20, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M1 1l22 22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Checkbox ─────────────────────────────────────────────────
function Checkbox({ checked, onPress, children }: { checked: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity style={st.checkRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[st.checkBox, checked && st.checkBoxChecked]}>
        {checked && <Svg width={12} height={12} viewBox="0 0 24 24" fill="none"><Polyline points="20 6 9 17 4 12" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></Svg>}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </TouchableOpacity>
  );
}

// ── MAIN ─────────────────────────────────────────────────────
export default function RegisterUserScreen() {
  const [activeRole, setActiveRole] = useState<'user' | 'mechanic'>('user');

  // Kişisel
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Güvenlik
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showPassConfirm, setShowPassConfirm] = useState(false);

  // Checkboxes
  const [kvkk, setKvkk] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      Alert.alert('Eksik Bilgi', 'Ad Soyad, E-posta ve Telefon zorunludur.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor.');
      return;
    }
    if (!kvkk || !terms) {
      Alert.alert('Eksik Onay', 'KVKK ve Kullanım Koşullarını kabul etmelisiniz.');
      return;
    }

    try {
      const normalizedEmail = validateAuthEmail(email);
      setCustomerRegistrationDraft({ email: normalizedEmail, password, fullName: fullName.trim(), phone: phone.trim() });
      router.push('/auth/vehicle-info');
    } catch (error: any) { Alert.alert('Kayıt Bilgileri', error.message); }

  };

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <ScrollView contentContainerStyle={st.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>

        {/* ─── HEADER ─── */}
        <View style={st.header}>
          <TouchableOpacity style={st.headerBtn} onPress={() => router.back()}>
            <IconBack size={22} color="#1E293B" />
          </TouchableOpacity>
          <SanayixLogo iconSize={36} fontSize={20} />
          <View style={st.headerBtn}>
            <IconProfile size={22} color="#1E293B" />
          </View>
        </View>

        {/* ─── TITLE ─── */}
        <Text style={st.pageTitle}>Müşteri Hesabı{'\n'}Oluştur</Text>
        <Text style={st.pageSubtitle}>Aracınız için doğru ustaya hızlıca ulaşın.</Text>

        {/* ─── ROLE TOGGLE ─── */}
        <View style={st.toggleRow}>
          <TouchableOpacity
            style={[st.toggleBtn, activeRole === 'user' && st.toggleBtnActive]}
            onPress={() => setActiveRole('user')}
            activeOpacity={0.8}
          >
            <Text style={[st.toggleText, activeRole === 'user' && st.toggleTextActive]}>MÜŞTERİ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.toggleBtn, activeRole === 'mechanic' && st.toggleBtnActive]}
            onPress={() => {
              setActiveRole('mechanic');
              router.replace('/auth/register-mechanic');
            }}
            activeOpacity={0.8}
          >
            <Text style={[st.toggleText, activeRole === 'mechanic' && st.toggleTextActive]}>USTA</Text>
          </TouchableOpacity>
        </View>

        {/* ─── KİŞİSEL BİLGİLER ─── */}
        <Text style={st.sectionLabel}>KİŞİSEL BİLGİLER</Text>

        <View style={st.inputWrap}>
          <TextInput style={st.input} placeholder="Ad Soyad" placeholderTextColor="#94A3B8"
            value={fullName} onChangeText={setFullName} />
        </View>
        <View style={st.inputWrap}>
          <TextInput style={st.input} placeholder="E-posta" placeholderTextColor="#94A3B8"
            value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        </View>
        <View style={st.inputWrap}>
          <TextInput style={st.input} placeholder="Telefon" placeholderTextColor="#94A3B8"
            value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </View>


        {/* ─── GÜVENLİK ─── */}
        <Text style={st.sectionLabel}>GÜVENLİK</Text>

        <View style={st.inputWrap}>
          <TextInput style={[st.input, { flex: 1 }]} placeholder="Şifre" placeholderTextColor="#94A3B8"
            value={password} onChangeText={setPassword} secureTextEntry={!showPass} />
          <TouchableOpacity onPress={() => setShowPass(!showPass)} style={st.eyeBtn}>
            {showPass ? <IconEyeOff size={20} color="#94A3B8" /> : <IconEye size={20} color="#94A3B8" />}
          </TouchableOpacity>
        </View>
        <View style={st.inputWrap}>
          <TextInput style={[st.input, { flex: 1 }]} placeholder="Şifre Tekrar" placeholderTextColor="#94A3B8"
            value={passwordConfirm} onChangeText={setPasswordConfirm} secureTextEntry={!showPassConfirm} />
          <TouchableOpacity onPress={() => setShowPassConfirm(!showPassConfirm)} style={st.eyeBtn}>
            {showPassConfirm ? <IconEyeOff size={20} color="#94A3B8" /> : <IconEye size={20} color="#94A3B8" />}
          </TouchableOpacity>
        </View>

        {/* ─── CHECKBOXES ─── */}
        <View style={st.checkSection}>
          <Checkbox checked={kvkk} onPress={() => setKvkk(!kvkk)}>
            <Text style={st.checkText}>
              <Text style={st.checkLink} onPress={(event) => { event.stopPropagation(); router.push('/legal/kvkk'); }}>KVKK Aydınlatma Metni</Text>'ni okudum.
            </Text>
          </Checkbox>
          <Checkbox checked={terms} onPress={() => setTerms(!terms)}>
            <Text style={st.checkText}>
              <Text style={st.checkLink} onPress={(event) => { event.stopPropagation(); router.push('/legal/terms'); }}>Kullanım Koşulları</Text> ve <Text style={st.checkLink} onPress={(event) => { event.stopPropagation(); router.push('/legal/privacy'); }}>Gizlilik Politikası</Text>'nı kabul ediyorum.
            </Text>
          </Checkbox>
          <Checkbox checked={marketing} onPress={() => setMarketing(!marketing)}>
            <Text style={st.checkText}>
              Kampanya ve bilgilendirme mesajları almak istiyorum. <Text style={st.checkOptional}>(İsteğe bağlı)</Text>
            </Text>
          </Checkbox>
        </View>

        {/* ─── İLERİ BUTONU ─── */}
        <TouchableOpacity
          style={[st.submitBtn, loading && { opacity: 0.7 }]}
          onPress={handleNext}
          activeOpacity={0.85}
          disabled={loading}
        >
          <Text style={st.submitBtnText}>
            {loading ? 'Kontrol Ediliyor...' : 'Devam Et — Araç Bilgileri'}
          </Text>
        </TouchableOpacity>

        {/* ─── GİRİŞ LİNK ─── */}
        <TouchableOpacity onPress={() => router.push('/auth/login')} style={st.loginRow}>
          <Text style={st.loginText}>
            Zaten hesabın var mı? <Text style={st.loginBold}>Giriş Yap</Text>
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── STYLES ───────────────────────────────────────────────────
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F8' },
  scrollContent: { paddingBottom: 32 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 12, paddingHorizontal: 20,
    backgroundColor: '#F4F6F8',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerLogo: { fontFamily: FONTS.extrabold, fontSize: 20, color: NAV_BLUE, letterSpacing: -0.5 },

  // Title
  pageTitle: { fontFamily: FONTS.extrabold, fontSize: 32, color: '#1E293B', lineHeight: 40, paddingHorizontal: 24, marginTop: 8 },
  pageSubtitle: { fontFamily: FONTS.regular, fontSize: 15, color: '#64748B', lineHeight: 22, paddingHorizontal: 24, marginTop: 8, marginBottom: 24 },

  // Toggle
  toggleRow: { flexDirection: 'row', marginHorizontal: 24, marginBottom: 28, gap: 0 },
  toggleBtn: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: BORDER_RADIUS.full, backgroundColor: 'transparent' },
  toggleBtnActive: { backgroundColor: '#FFF5E6' },
  toggleText: { fontFamily: FONTS.semibold, fontSize: 14, color: '#94A3B8', letterSpacing: 0.5 },
  toggleTextActive: { color: AMBER },

  // Section
  sectionLabel: { fontFamily: FONTS.semibold, fontSize: 11, color: '#94A3B8', letterSpacing: 1.5, paddingHorizontal: 24, marginBottom: 14, marginTop: 8 },

  // Input
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 24, marginBottom: 12,
    paddingHorizontal: 16, minHeight: 54,
    borderBottomWidth: 1, borderBottomColor: '#E8ECF0',
  },
  input: { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: '#1E293B', paddingVertical: 16 },

  // Eye btn
  eyeBtn: { padding: 8 },

  // Checkboxes
  checkSection: { paddingHorizontal: 24, marginTop: 20, gap: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkBoxChecked: { backgroundColor: NAV_BLUE, borderColor: NAV_BLUE },
  checkText: { fontFamily: FONTS.regular, fontSize: 13, color: '#475569', lineHeight: 20 },
  checkLink: { fontFamily: FONTS.semibold, color: '#2563EB' },
  checkOptional: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8' },

  // Submit
  submitBtn: {
    backgroundColor: NAV_BLUE, borderRadius: 16, paddingVertical: 18,
    marginHorizontal: 24, marginTop: 28, alignItems: 'center',
  },
  submitBtnText: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#fff' },

  // Login link
  loginRow: { marginTop: 20, alignItems: 'center' },
  loginText: { fontFamily: FONTS.regular, fontSize: 14, color: '#64748B' },
  loginBold: { fontFamily: FONTS.semibold, color: NAV_BLUE },
});
