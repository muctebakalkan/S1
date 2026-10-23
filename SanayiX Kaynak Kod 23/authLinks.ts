import type { SupabaseClient, Session } from '@supabase/supabase-js';

export const AUTH_REDIRECT_URI = 'sanayix://auth/callback';
type AuthLinkClient = Pick<SupabaseClient, 'auth'>;
type LinkResult = { session: Session; recovery: boolean };
let recoveryGrant: { userId: string; expiresAt: number } | null = null;
const exchangingLinks = new Map<string, Promise<LinkResult>>();
let recentLink: { url: string; result: LinkResult; expiresAt: number } | null = null;

export function parseAuthLink(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Bağlantı geçersiz. Yeni bir bağlantı isteyin.'); }
  if (parsed.protocol !== 'sanayix:' || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
    throw new Error('Bu bağlantı SanayiX giriş bağlantısı değil.');
  }
  const params = new URLSearchParams(parsed.search);
  for (const [key, value] of new URLSearchParams(parsed.hash.slice(1))) {
    if (params.has(key) && params.get(key) !== value) throw new Error('Bağlantı bilgileri çelişiyor. Yeni bir bağlantı isteyin.');
    params.set(key, value);
  }
  if (params.has('error') || params.has('error_code')) throw new Error('Bağlantının süresi dolmuş veya işlem iptal edilmiş. Yeni bir bağlantı isteyin.');
  const code = params.get('code');
  const accessToken = params.get('access_token'), refreshToken = params.get('refresh_token');
  if ((!code && (!accessToken || !refreshToken)) || (code && (accessToken || refreshToken))) {
    throw new Error('Bağlantı eksik veya geçersiz. Yeni bir bağlantı isteyin.');
  }
  return { code, accessToken, refreshToken, recovery: params.get('type') === 'recovery' };
}

/** Expo Router includes hash parameters under '#', including on warm app opens. */
export function authLinkFromRouteParams(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const key of ['code', 'access_token', 'refresh_token', 'type', 'error', 'error_code']) {
    const value = params[key];
    if (Array.isArray(value)) throw new Error('Bağlantıda tekrarlanan bilgiler var.');
    if (value) query.set(key, value);
  }
  const hash = params['#'];
  if (Array.isArray(hash)) throw new Error('Bağlantı geçersiz.');
  return `${AUTH_REDIRECT_URI}?${query}${hash ? `#${hash}` : ''}`;
}

export function clearAuthLinkState() {
  recoveryGrant = null;
  recentLink = null;
}
export function canResetPassword(userId?: string) {
  return !!userId && recoveryGrant?.userId === userId && recoveryGrant.expiresAt > Date.now();
}

export async function exchangeAuthLink(client: AuthLinkClient, url: string): Promise<LinkResult> {
  const link = parseAuthLink(url);
  if (recentLink?.url === url && recentLink.expiresAt > Date.now()) return recentLink.result;
  const current = exchangingLinks.get(url);
  if (current) return current;
  const work = (async () => {
    const { data, error } = link.code
      ? await client.auth.exchangeCodeForSession(link.code)
      : await client.auth.setSession({ access_token: link.accessToken!, refresh_token: link.refreshToken! });
    if (error) throw error;
    if (!data.session?.user) throw new Error('Bağlantıdan oturum alınamadı. Yeni bir bağlantı isteyin.');
    const recovery = link.recovery || ('redirectType' in data && data.redirectType === 'recovery');
    const result = { session: data.session, recovery };
    if (recovery) recoveryGrant = { userId: data.session.user.id, expiresAt: Date.now() + 10 * 60 * 1000 };
    recentLink = { url, result, expiresAt: Date.now() + 30000 };
    return result;
  })().finally(() => exchangingLinks.delete(url));
  exchangingLinks.set(url, work);
  return work;
}

export function validateAuthEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi girin.');
  return email;
}

export async function sendPasswordRecovery(client: AuthLinkClient, value: string) {
  const email = validateAuthEmail(value);
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT_URI });
  if (error) throw error;
}

export async function resendConfirmation(client: AuthLinkClient, value: string) {
  const email = validateAuthEmail(value);
  const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: AUTH_REDIRECT_URI } });
  if (error) throw error;
}

export async function saveRecoveredPassword(client: AuthLinkClient, password: string, confirmation: string) {
  if (password.length < 8) throw new Error('Yeni şifre en az 8 karakter olmalıdır.');
  if (password !== confirmation) throw new Error('Şifreler eşleşmiyor.');
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!canResetPassword(user?.id)) throw new Error('Şifre yenileme bağlantısını tekrar açın veya yeni bağlantı isteyin.');
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
  clearAuthLinkState();
  // A password update succeeded even if the separate sign-out request fails.
  try {
    const signedOut = await client.auth.signOut({ scope: 'local' });
    return { signedOut: !signedOut.error };
  } catch { return { signedOut: false }; }
}
