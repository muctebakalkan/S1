import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { finishSocialSignIn } from '../../lib/auth';
import { authLinkFromRouteParams, exchangeAuthLink } from '../../lib/authLinks';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../lib/constants';
import AuthMessageScreen from '../../components/AuthMessageScreen';
import { Button } from '../../components/Button';
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  let url = '', parseError = '';
  try { url = authLinkFromRouteParams(params); } catch (e: any) { parseError = e.message; }
  useEffect(() => {
    let active = true;
    setError('');
    (async () => {
      try {
        if (parseError) throw new Error(parseError);
        const result = await exchangeAuthLink(supabase, url);
        if (!active) return;
        if (result.recovery) { router.replace('/auth/reset-password'); return; }
        await finishSocialSignIn(result.session);
      } catch (e: any) {
        // Never log callback URLs: they can contain live session credentials.
        if (active) setError(e.message || 'Bağlantı işlenemedi. Yeniden deneyin.');
      }
    })();
    return () => { active = false; };
  }, [url, parseError, retry]);
  return <AuthMessageScreen title={error ? 'İşlem tamamlanamadı' : 'Bağlantı doğrulanıyor'} description={error ? 'Bağlantını kontrol edebilir veya giriş ekranına dönebilirsin.' : 'Lütfen bekle, hesabın hazırlanıyor.'}>
    {error ? <><Text accessibilityRole="alert" style={{ color: COLORS.error }}>{error}</Text>
      <Button title="Tekrar Dene" onPress={() => setRetry(n => n + 1)} />
      <Button title="Girişe Dön" variant="outline" onPress={() => router.replace('/auth/login')} /></> : <ActivityIndicator color={COLORS.primary} />}
  </AuthMessageScreen>;
}
