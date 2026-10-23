import { useEffect } from 'react';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Platform, Alert, AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { registerDeviceToken } from '../lib/admin/push';
import { pauseTrackingOnSignOut } from '../lib/driving/tracking';
import { clearAuthLinkState } from '../lib/authLinks';
import { clearCustomerRegistrationDraft } from '../lib/registrationDraft';
import { ErrorBoundary } from '../components/ErrorBoundary';

import WebAlertHost from '../components/WebAlertHost';
import { showWebAlert } from '../lib/webAlert';

void SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS === 'web') Alert.alert = showWebAlert;

export default function RootLayout() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/") void SplashScreen.hideAsync().catch(() => {});
    const fallback = setTimeout(() => { void SplashScreen.hideAsync().catch(() => {}); }, 8000);
    return () => clearTimeout(fallback);
  }, [pathname]);
  useEffect(() => {
    const refreshSession = (state: string) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    const listener = Platform.OS !== 'web' ? AppState.addEventListener('change', refreshSession) : null;
    if (Platform.OS !== 'web') refreshSession(AppState.currentState);
    return () => { listener?.remove(); if (Platform.OS !== 'web') supabase.auth.stopAutoRefresh(); };
  }, []);

  useEffect(() => {
    // Oturum açık kullanıcının push token'ını kaydet (toplu bildirim altyapısı).
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) registerDeviceToken().catch(console.error);
    }).catch(console.error);
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { clearAuthLinkState(); clearCustomerRegistrationDraft(); setTimeout(() => { pauseTrackingOnSignOut().catch(console.error); }, 0); }
      // Auth callbacks run under the session lock; defer further Auth calls.
      if (event === 'SIGNED_IN' && session) {
        setTimeout(() => { if (mounted) registerDeviceToken().catch(console.error); }, 0);
      }
    });
    return () => { mounted = false; sub?.subscription?.unsubscribe(); };
  }, []);

  return (
    <ErrorBoundary>
      <WebAlertHost />
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: '#050A0D' }
        }}
      />
    </ErrorBoundary>
  );
}
