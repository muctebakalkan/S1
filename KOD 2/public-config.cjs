const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePublicConfig } = require('../config/validatePublicConfig.cjs');
const defaults = require('../config/supabase.public.json');
const now = Date.UTC(2026, 8, 16);
const token = (claims) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'test_signature'].join('.');
const anon = (overrides = {}) => token({ role: 'anon', ref: 'testproject', exp: now / 1000 + 3600, ...overrides });
const env = key => ({ EXPO_PUBLIC_SUPABASE_URL: 'https://testproject.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: key });

test('existing public project configuration still works without environment overrides', () => {
  assert.equal(validatePublicConfig({}, now).url, defaults.url);
});
test('valid same-project anon keys and surrounding whitespace are accepted', () => {
  const result = validatePublicConfig(env(` ${anon()} `), now);
  assert.equal(result.key, anon());
});
test('new publishable keys work through either supported variable name', () => {
  const key = 'sb_publishable_abcdefghijklmnopqrstuvwxyz';
  assert.equal(validatePublicConfig(env(key), now).key, key);
  assert.equal(validatePublicConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://testproject.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }, now).key, key);
});
test('partial overrides never silently mix two projects', () => {
  for (const input of [{ EXPO_PUBLIC_SUPABASE_URL: 'https://testproject.supabase.co' }, { EXPO_PUBLIC_SUPABASE_ANON_KEY: anon() }]) {
    assert.throws(() => validatePublicConfig(input, now), /birlikte/);
  }
});
test('two differing key variables are rejected', () => {
  assert.throws(() => validatePublicConfig({ ...env(anon()), EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz' }, now), /tek bir/);
});
test('secret keys, service-role JWTs and sensitive public variable names fail without exposing their values', () => {
  for (const input of [env('sb_secret_do_not_print'), env(token({ role: 'service_role' })), { EXPO_PUBLIC_SMTP_PASSWORD: 'do_not_print' }, { EXPO_PUBLIC_OTHER: token({ role: 'service_role' }) }]) {
    assert.throws(() => validatePublicConfig(input, now), error => {
      assert(!Object.values(input).some(value => error.message.includes(value)));
      return /Gizli/.test(error.message);
    });
  }
});
test('private server environment keys are not mistaken for public app configuration', () => {
  assert.equal(validatePublicConfig({ SUPABASE_SERVICE_ROLE_KEY: 'server-only-value' }, now).url, defaults.url);
});
test('insecure, credential-bearing, malformed and placeholder URLs are rejected', () => {
  for (const url of ['http://testproject.supabase.co', 'https://user:password@testproject.supabase.co', 'https://testproject.supabase.co/path', 'https://testproject.supabase.co?token=abc', 'https://testproject.supabase.co#token', 'not a URL', 'https://YOUR_PROJECT_REF.supabase.co']) {
    assert.throws(() => validatePublicConfig({ ...env(anon()), EXPO_PUBLIC_SUPABASE_URL: url }, now));
  }
});
test('a valid JWT from another project is rejected', () => {
  assert.throws(() => validatePublicConfig(env(anon({ ref: 'otherproject' })), now), /farklı projelere/);
});
test('expired, undated, malformed, session and placeholder keys are rejected', () => {
  for (const key of [anon({ exp: now / 1000 }), anon({ exp: undefined }), 'bad.key.value', token({ role: 'authenticated' }), 'YOUR_PUBLISHABLE_OR_ANON_KEY', 'sb_publishable_short']) {
    assert.throws(() => validatePublicConfig(env(key), now));
  }
});
