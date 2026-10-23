import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { canResetPassword, saveRecoveredPassword } from '../../lib/authLinks';
import { COLORS } from '../../lib/constants';
import AuthMessageScreen from '../../components/AuthMessageScreen';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
export default function ResetPasswordScreen() {
  const [ready, setReady] = useState<boolean | null>(null), [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [done, setDone] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) setReady(canResetPassword(data.session?.user.id)); })
      .catch(() => { if (mounted) setReady(false); });
    return () => { mounted = false; };
  }, []);
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await saveRecoveredPassword(supabase, password, confirmation); setPassword(''); setConfirmation(''); setDone(true); }
    catch (e: any) { setError(e.message || 'Şifre güncellenemedi. Tekrar deneyin.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <AuthMessageScreen title={done ? 'Şifren güncellendi' : 'Yeni şifre oluştur'}
    description={done ? 'Yeni şifrenle giriş yapabilirsin.' : ready === false ? 'Şifre yenileme bağlantısı yok veya süresi doldu. E-postandaki bağlantıyı tekrar aç ya da yeni bir bağlantı iste.' : 'En az 8 karakterli yeni bir şifre belirle.'}>
    {ready === null && <ActivityIndicator color={COLORS.primary} />}
    {ready && !done && <><Input label="Yeni şifre" accessibilityLabel="Yeni şifre" secureTextEntry value={password} onChangeText={setPassword} autoCapitalize="none" />
      <Input label="Yeni şifre tekrar" accessibilityLabel="Yeni şifre tekrar" secureTextEntry value={confirmation} onChangeText={setConfirmation} autoCapitalize="none" />
      {!!error && <Text accessibilityRole="alert" style={{ color: COLORS.error }}>{error}</Text>}
      <Button title="Şifreyi Güncelle" onPress={save} loading={busy} /></>}
    {ready === false && <Button title="Yeni Bağlantı İste" onPress={() => router.replace('/auth/forgot-password')} />}
    <Button title="Girişe Dön" variant="outline" onPress={() => router.replace('/auth/login')} disabled={busy} />
  </AuthMessageScreen>;
}
