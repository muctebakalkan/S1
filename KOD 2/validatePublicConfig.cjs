const defaults = require('./supabase.public.json');

// This is a build-time check, not JWT signature verification. Supabase still
// authenticates requests and enforces RLS. Never put a key in an error message.
function jwtClaims(key) {
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return null; }
}

function validatePublicConfig(env = process.env, now = Date.now()) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('EXPO_PUBLIC_') || !value) continue;
    if (/SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY|SMTP/i.test(name) ||
        value.trim().startsWith('sb_secret_') || jwtClaims(value.trim())?.role === 'service_role') {
      throw new Error('Gizli bir değer EXPO_PUBLIC_ ayarlarında kullanılamaz. Anahtarı uygulama paketine eklemeyin.');
    }
  }
  const configuredUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const publishable = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (anon && publishable && anon !== publishable) throw new Error('Supabase için tek bir istemci anahtarı tanımlayın.');
  const configuredKey = publishable || anon;
  if (Boolean(configuredUrl) !== Boolean(configuredKey)) throw new Error('Supabase adresi ve istemci anahtarı birlikte tanımlanmalıdır.');
  const url = configuredUrl || defaults.url;
  const key = configuredKey || defaults.anonKey;
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Supabase adresi geçersiz.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
      !['', '/'].includes(parsed.pathname) || /YOUR_PROJECT|localhost/i.test(parsed.hostname)) {
    throw new Error('Supabase için kullanıcı bilgisi içermeyen bir HTTPS proje adresi kullanın.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) {
    const claims = jwtClaims(key);
    if (!claims || claims.role !== 'anon') throw new Error('Supabase anahtarı publishable veya anon olmalıdır.');
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now) throw new Error('Supabase istemci anahtarının süresi dolmuş veya tarihi eksik.');
    const hostedProject = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
    if (hostedProject && claims.ref !== hostedProject) throw new Error('Supabase adresi ve anahtarı farklı projelere ait.');
  }
  return { url, key };
}

module.exports = { validatePublicConfig };
