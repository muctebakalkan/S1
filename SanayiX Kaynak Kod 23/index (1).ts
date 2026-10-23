import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_ANALYSIS_PROMPT = `Sen bir otomotiv hasar ve arıza analiz uzmanısın. Yalnızca verilen fotoğraf veya açıklamadaki gözlemlere dayan. Kesin teşhis koyma ve fiyatların tahmini olduğunu açıkça belirt. SADECE şu JSON formatında yanıt ver:
{"damageType":"Arıza veya hasar türü","affectedArea":"Etkilenen bölüm","severity":"Hafif | Orta | Ağır","possibleCauses":["Olası neden"],"possibleProblems":["Olası sorun"],"possibleAction":"Önerilen işlem","recommendedSpecialty":"Usta türü","maintenanceTips":["Öneri"],"estimatedCost":"Tahmini TL aralığı","urgencyLevel":"low | medium | high","disclaimer":"Bu analiz yalnızca bilgilendirme amaçlıdır. Kesin tespit ve fiyat için uzman kontrolü gerekir."}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

class ServiceError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) { super(message); this.code = code; this.status = status; }
}

async function providerResponse(response: Response) {
  if (response.ok) return response;
  if (response.status === 401 || response.status === 403) throw new ServiceError('AI_PROVIDER_AUTH', 503, 'AI bağlantı ayarları kontrol edilmeli.');
  if (response.status === 429) {
    const body = await response.json().catch(() => null);
    if (body?.error?.code === 'insufficient_quota') throw new ServiceError('AI_QUOTA_EXCEEDED', 503, 'AI kullanım limiti doldu.');
    throw new ServiceError('AI_RATE_LIMITED', 429, 'AI hizmeti yoğun. Biraz sonra tekrar deneyin.');
  }
  throw new ServiceError('AI_UNAVAILABLE', 502, 'AI hizmetinden yanıt alınamadı.');
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  try {
    const value = match && JSON.parse(match[0]);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ServiceError('AI_INVALID_RESPONSE', 502, 'Analiz sonucu okunamadı.'); }
}

async function ensureAuthenticated(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return false;
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  );
  const { data, error } = await client.auth.getUser();
  return !error && !!data.user;
}

async function chat(openAiKey: string, system: string, userContent: unknown, maxTokens: number) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(45_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });
  await providerResponse(response);
  const data = await response.json();
  return extractJson(data.choices?.[0]?.message?.content ?? '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ code: 'AI_INVALID_INPUT', error: 'Geçersiz istek yöntemi.' }, 405);
  try {
    if (!(await ensureAuthenticated(req))) return json({ code: 'AI_AUTH_REQUIRED', error: 'Oturum gerekli.' }, 401);
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) return json({ code: 'AI_NOT_CONFIGURED', error: 'AI servisi henüz yapılandırılmadı.' }, 503);

    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      if (form.get('action') !== 'transcribe') return json({ code: 'AI_INVALID_INPUT', error: 'Geçersiz işlem.' }, 400);
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) return json({ code: 'AI_INVALID_INPUT', error: 'Geçerli ve 20 MB altı bir ses kaydı gerekli.' }, 400);
      const outbound = new FormData();
      outbound.append('file', file, file.name || 'recording.m4a');
      outbound.append('model', 'whisper-1');
      outbound.append('language', String(form.get('language') || 'tr'));
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', signal: AbortSignal.timeout(45_000), headers: { Authorization: `Bearer ${openAiKey}` }, body: outbound,
      });
      await providerResponse(response);
      return json(await response.json());
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ code: 'AI_INVALID_INPUT', error: 'Geçerli bir istek gerekli.' }, 400);
    if (body.action === 'analyze_image') {
      if (typeof body.imageBase64 !== 'string' || !body.imageBase64.trim() || body.imageBase64.length > 12_000_000) return json({ code: 'AI_INVALID_INPUT', error: 'Geçerli bir görsel gerekli.' }, 400);
      const prompt = typeof body.systemPrompt === 'string' && body.systemPrompt.length < 12000 ? body.systemPrompt : DEFAULT_ANALYSIS_PROMPT;
      const result = await chat(openAiKey, prompt, [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${body.imageBase64}`, detail: 'high' } },
        { type: 'text', text: `Bu araç fotoğrafındaki görünür hasarı veya arıza işaretini analiz et. Kullanıcı açıklaması: ${String(body.description || 'Belirtilmedi').slice(0, 4000)}` },
      ], 900);
      return json({ result });
    }
    if (body.action === 'analyze_text') {
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '';
      if (!description) return json({ code: 'AI_INVALID_INPUT', error: 'Arıza açıklaması gerekli.' }, 400);
      const prompt = typeof body.systemPrompt === 'string' && body.systemPrompt.length < 12000 ? body.systemPrompt : DEFAULT_ANALYSIS_PROMPT;
      return json({ result: await chat(openAiKey, prompt, `Kullanıcının araç arıza tarifi: ${description}`, 900) });
    }
    if (body.action === 'part_compatibility') {
      const system = 'Bir otomotiv yedek parça uyumluluk uzmanısın. Yalnızca verilen JSON verisine dayan, uydurma. SADECE {"verdict":"uyumlu|kismen|uyumsuz|belirsiz","answer":"Kısa Türkçe açıklama","disclaimer":"Kesin montaj için OEM numarasını ustanıza doğrulatın."} biçiminde JSON döndür.';
      return json({ result: await chat(openAiKey, system, JSON.stringify(body.payload ?? {}), 400) });
    }
    return json({ code: 'AI_INVALID_INPUT', error: 'Geçersiz işlem.' }, 400);
  } catch (error) {
    if (error instanceof ServiceError) return json({ code: error.code, error: error.message }, error.status);
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return json({ code: 'AI_TIMEOUT', error: 'Analiz zamanında tamamlanamadı.' }, 504);
    return json({ code: 'AI_UNAVAILABLE', error: 'AI hizmeti şu anda yanıt veremiyor.' }, 502);
  }
});
