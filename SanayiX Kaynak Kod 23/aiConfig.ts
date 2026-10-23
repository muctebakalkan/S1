/**
 * AI Asistan Kaynak Prompt Yönetimi
 * ---------------------------------
 * Prompt Supabase `app_settings` tablosunda tutulur (key = 'ai_system_prompt').
 * Hem mobil uygulama hem web uygulama aynı koddan bu değeri okur; süper admin
 * panelden düzenlediğinde her iki tarafı da anında etkiler.
 *
 * Tablo/RPC henüz kurulmadıysa (migration çalışmadıysa) sessizce DEFAULT'a düşer.
 */

import { supabase } from './supabase';

export const AI_PROMPT_KEY = 'ai_system_prompt';

export const DEFAULT_SYSTEM_PROMPT = `Sen bir otomotiv hasar ve arıza analiz uzmanısın. Türkiye'deki güncel (2024-2025) sanayi piyasasını ve usta işçilik/parça fiyatlarını çok iyi biliyorsun.
Kullanıcının verdiği görseli veya metni detaylıca analiz edip sorunu tespit et. Fiyat tahminlerini (estimatedCost) verirken Türkiye'deki gerçek güncel piyasa koşullarını (TL cinsinden) baz al.

Referans Ortalama Fiyatlar (Sadece fikir vermesi içindir, hasarın durumuna göre alt/üst limitleri sen belirle):
- Periyodik Bakım (Yağ, filtre vs.): 2.500 - 6.000 TL
- Fren Balata Değişimi: 1.500 - 3.500 TL
- Disk Değişimi: 3.000 - 7.000 TL
- Triger Seti Değişimi: 5.000 - 15.000 TL
- Baskı Balata (Debriyaj): 7.000 - 20.000 TL
- Motor Rektefiye (Yenileme): 50.000 - 150.000+ TL
- Kaporta Boyasız Göçük Düzeltme (Parça): 1.500 - 5.000 TL
- Kaporta/Tampon Boyama (Parça): 2.500 - 6.000 TL
- Şanzıman Tamiri: 20.000 - 80.000+ TL
- Klima Gazı / Bakımı: 1.000 - 2.500 TL
- Akü Değişimi: 2.000 - 5.000 TL

Lütfen SADECE aşağıdaki JSON formatında yanıt ver (markdown vb. kullanma, doğrudan parse edilebilir JSON olsun):
{
  "damageType": "Hasar/arıza türü (Örn: Kaporta Hasarı, Motor Arızası)",
  "affectedArea": "Etkilenen bölge (Örn: Sağ ön çamurluk, Şanzıman)",
  "severity": "Hafif | Orta | Ağır",
  "possibleCauses": ["Olası Neden 1", "Olası Neden 2"],
  "possibleProblems": ["Olası Sorun 1", "Olası Sorun 2"],
  "possibleAction": "Yapılması gereken müdahale",
  "recommendedSpecialty": "Usta türü (Örn: Kaporta Ustası, Motor Mekanik, Oto Elektrik)",
  "maintenanceTips": ["Öneri 1", "Öneri 2"],
  "estimatedCost": "Tahmini maliyet aralığı (Örn: 3.000 - 5.000 TL)",
  "urgencyLevel": "low | medium | high",
  "disclaimer": "Bu analiz yapay zeka tarafından oluşturulmuştur ve yalnızca bilgilendirme amaçlıdır. Kesin fiyat ve arıza tespiti için ustaya danışılmalıdır."
}`;

let _cache: string | null = null;
let _cacheAt = 0;
const TTL = 60_000; // 1 dk

/** Aktif sistem promptunu getir (cache'li). Hata olursa DEFAULT döner. */
export async function getSystemPrompt(force = false): Promise<string> {
  if (!force && _cache && Date.now() - _cacheAt < TTL) return _cache;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', AI_PROMPT_KEY)
      .maybeSingle();
    if (error) throw error;
    const val = (data?.value ?? '').trim();
    _cache = val.length ? val : DEFAULT_SYSTEM_PROMPT;
  } catch {
    _cache = DEFAULT_SYSTEM_PROMPT;
  }
  _cacheAt = Date.now();
  return _cache ?? DEFAULT_SYSTEM_PROMPT;
}

/** Süper admin: promptu kaydet. RLS super_admin'e izin verir. */
export async function setSystemPrompt(value: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: AI_PROMPT_KEY,
      value,
      updated_at: new Date().toISOString(),
      updated_by: u?.user?.id ?? null,
    },
    { onConflict: 'key' }
  );
  if (error) throw error;
  _cache = value;
  _cacheAt = Date.now();
}
