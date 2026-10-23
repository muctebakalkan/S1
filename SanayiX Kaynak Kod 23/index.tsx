import { useEffect } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function SplashIndex() {
  useEffect(() => {
    const checkSession = async () => {
      try {

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          router.replace('/landing');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (!profileError) {
          if (profile?.role === 'super_admin') {
            router.replace('/admin');
          } else if (profile?.role === 'mechanic') {
            router.replace('/mechanic/home');
          } else if (profile?.role === 'seller') {
            router.replace('/seller/home');
          } else {
            router.replace('/user/home');
          }
        } else {
          router.replace('/user/home');
        }
      } catch (err) {
        console.warn('Session check failed:', err);
        router.replace('/onboarding');
      }
    };

    void checkSession();
  }, []);
  return null;
}
