import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { signInAndNavigate, signInWithApple, signInWithGoogle } from '../../lib/auth';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../../lib/constants';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import Svg, { Path } from 'react-native-svg';
import SanayixLogo from '../../components/SanayixLogo';
import * as AppleAuthentication from 'expo-apple-authentication';

const GoogleIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
    <Path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
    <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
    <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
  </Svg>
);

export default function LoginScreen() {
  const signingIn = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) setAppleAvailable(available);
      })
      .catch(() => {
        if (mounted) setAppleAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      // Safari'de Google sayfasını açar.
      // Geri dönüş app/auth/callback.tsx üzerinden olur.
      await signInWithGoogle();
    } catch (err: any) {
      Alert.alert('Google Giriş Hatası', err.message || 'Bir hata oluştu.');
    } finally {
      signingIn.current = false;
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setLoading(true);
    try {
      await signInWithApple();
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Giriş Hatası', err.message || 'Bir hata oluştu.');
    } finally {
      signingIn.current = false;
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (signingIn.current) return;
    if (!email.trim() || !password.trim()) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }
    signingIn.current = true;
    setLoading(true);
    try {
      await signInAndNavigate(email, password);
    } catch (err: any) {
      if (err.code === 'email_not_confirmed') { router.push({ pathname: '/auth/check-email', params: { email: email.trim() } }); }
      else Alert.alert('Giriş Hatası', err.message || 'Bir hata oluştu.');
    } finally {
      signingIn.current = false;
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>

        <View style={styles.logoRow}>
          <SanayixLogo theme="dark" iconSize={24} fontSize={18} />
        </View>

        <Text style={styles.title}>Tekrar{'\n'}Hoş Geldin</Text>
        <Text style={styles.subtitle}>Hesabına giriş yaparak devam et.</Text>

        {/* Google */}
        <TouchableOpacity
          style={[styles.socialBtn, loading && styles.socialDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Google ile Giriş Yap"
          onPress={handleGoogleLogin}
          activeOpacity={0.8}
          disabled={loading}
        >
          <GoogleIcon />
          <Text style={styles.socialBtnText}>Google ile Giriş Yap</Text>
        </TouchableOpacity>

        {/* Apple */}
        {appleAvailable && (
          <View
            style={[styles.appleButtonWrap, loading && styles.socialDisabled]}
            pointerEvents={loading ? 'none' : 'auto'}
          >
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={BORDER_RADIUS.md}
              style={styles.appleButton}
              onPress={handleAppleLogin}
            />
          </View>
        )}

        {/* Ayraç */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>ya da e-posta ile</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="Mail Adresi"
            placeholder="ornek@mail.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            label="Şifre"
            placeholder="Şifrenizi girin"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity style={styles.forgotRow} onPress={() => router.push('/auth/forgot-password')} disabled={loading}>
            <Text style={styles.forgotText}>Şifremi unuttum</Text>
          </TouchableOpacity>
        </View>

        <Button title="Giriş Yap" variant="primary" size="lg" loading={loading} onPress={handleLogin} style={styles.loginButton} />

        <TouchableOpacity style={styles.registerRow} onPress={() => router.push('/auth/role-select')}>
          <Text style={styles.registerText}>
            Hesabın yok mu?{'  '}
            <Text style={styles.registerLink}>Kayıt Ol</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: SPACING.lg, paddingTop: 64, paddingBottom: 48 },
  logoRow: { marginBottom: SPACING.xl },
  title: { fontFamily: FONTS.extrabold, fontSize: 32, color: COLORS.text, lineHeight: 42, marginBottom: SPACING.xs, letterSpacing: -0.3 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.xl },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#FFA31A',
    borderRadius: BORDER_RADIUS.md, paddingVertical: 17, minHeight: 56, marginBottom: SPACING.sm,
    ...SHADOW.card, shadowOpacity: 0.06,
  },
  socialBtnText: { fontFamily: FONTS.bold, fontSize: 17, color: '#171C20' },
  appleButtonWrap: {
    width: '100%',
    height: 50,
    marginBottom: 0,
    opacity: 1,
  },
  socialDisabled: { opacity: 0.6 },
  appleButton: {
    width: '100%',
    height: 50,
  },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.lg, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textLight },
  form: { marginBottom: SPACING.md },
  forgotRow: { alignSelf: 'flex-end', marginTop: -SPACING.sm },
  forgotText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.secondary },
  loginButton: { width: '100%', marginBottom: SPACING.lg },
  registerRow: { alignItems: 'center' },
  registerText: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textSecondary },
  registerLink: { fontFamily: FONTS.semibold, color: COLORS.primary },
});
