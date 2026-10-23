import React, { useRef, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { resendConfirmation } from '../../lib/authLinks';
import { COLORS } from '../../lib/constants';
import AuthMessageScreen from '../../components/AuthMessageScreen';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
export default function CheckEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || ''), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const sending = useRef(false);
  const resend = async () => {
    if (sending.current) return;
    if (Date.now() < retryAt) { setError('Tekrar göndermeden önce bir dakika bekleyin.'); return; }
    sending.current = true; setBusy(true); setError(''); setMessage('');
    try { await resendConfirmation(supabase, email); setMessage('Adres doğrulama için uygunsa yeni bağlantı gönderilecektir. İstenmeyen posta klasörünü de kontrol edin.'); setRetryAt(Date.now() + 60000); }
    catch (e: any) { setError(e.message || 'Bağlantı gönderilemedi. Tekrar deneyin.'); }
    finally { sending.current = false; setBusy(false); }
  };
  return <AuthMessageScreen title="E-postanı doğrula" description="Kayıt işlemini tamamlamak için e-postandaki doğrulama bağlantısını aç, ardından giriş yap. Hesap zaten kayıtlıysa giriş ekranını kullanabilirsin.">
    <Input label="E-posta" accessibilityLabel="E-posta" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
    {!!message && <Text accessibilityRole="alert" style={{ color: COLORS.text }}>{message}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: COLORS.error }}>{error}</Text>}
    <Button title="Bağlantıyı Tekrar Gönder" onPress={resend} loading={busy} />
    <Button title="Giriş Yap" variant="outline" onPress={() => router.replace('/auth/login')} disabled={busy} />
  </AuthMessageScreen>;
}
