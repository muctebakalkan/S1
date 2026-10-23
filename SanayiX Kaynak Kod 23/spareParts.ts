import { vehicleNameKey } from '../supabase/functions/_shared/vehicleNames';
/**
 * Akıllı Uyumluluk & Rehber — Veri Erişim Katmanı
 * ------------------------------------------------
 * spare_parts kataloğu üzerinde araç/OEM sorgulama, uyumluluk hesaplama,
 * AI destekli uyumluluk yanıtı ve "Yanlış Parça Bildir" işlemleri.
 *
 * Uyumluluk mantığı hem Postgres RPC'sinde (search_compatible_parts) hem de
 * burada (checkCompatibility) tanımlıdır. RPC birincil kaynaktır; RPC yoksa
 * (ör. henüz kurulmadıysa) tablo sorgusu + JS eşleştirmeye düşülür.
 */

import { supabase } from './supabase';

// ── Tipler ──────────────────────────────────────────────────
export interface Fitment {
  brand: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  engine?: string; // boş/undefined => tüm motorlar
}

export interface SparePart {
  id: string;
  name: string;
  category: string;
  brand?: string | null;
  oem_code: string;
  cross_reference?: string[];
  compatible_vehicles: Fitment[];
  technical_specs: Record<string, string>;
  price?: number | null;
  image_url?: string | null;
  guide_url?: string | null;
  video_url?: string | null;
  is_verified?: boolean;
  seller_id?: string | null;
  seller_name?: string | null;
  seller_phone?: string | null;
  seller_rating?: number | null;
  stock_quantity?: number | null;
  condition?: string | null;
  location?: string | null;
}

export interface VehicleSelection {
  brand: string;
  model?: string;
  year?: number;
  engine?: string;
}

export type MatchLevel = 'exact' | 'likely' | 'none';

export interface Compatibility {
  level: MatchLevel;
  label: string;
  color: string;
  bg: string;
}

/** SparePart + hesaplanmış uyumluluk. */
export interface SparePartResult extends SparePart {
  compatibility: Compatibility;
}

// ── Sabitler ────────────────────────────────────────────────
export const ENGINE_TYPES = [
  '1.0 TSI', '1.2 TSI', '1.4 TSI', '1.6 TDI', '2.0 TDI', '2.0 TSI',
  '1.5 dCi', '1.6 Benzin', '1.4 Benzin', '1.3 CDI', '1.6 CRDi', 'Elektrik', 'Hibrit',
];

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'yanlis_uyumluluk', label: 'Aracıma uymuyor / yanlış uyumluluk' },
  { id: 'yanlis_oem', label: 'OEM / referans kodu hatalı' },
  { id: 'eksik_bilgi', label: 'Teknik bilgi eksik veya hatalı' },
  { id: 'diger', label: 'Diğer' },
];

const COMPAT: Record<MatchLevel, Compatibility> = {
  exact:  { level: 'exact',  label: 'İlan bilgilerine göre uyumlu', color: '#059669', bg: '#D1FAE5' },
  likely: { level: 'likely', label: 'Muhtemelen Uyumlu',  color: '#D97706', bg: '#FEF3C7' },
  none:   { level: 'none',   label: 'Uyumluluk Belirsiz', color: '#6B7280', bg: '#F1F5F9' },
};

// ── Uyumluluk hesabı (JS — RPC ile aynı mantık) ─────────────
export function checkCompatibility(
  fitments: Fitment[],
  sel: VehicleSelection
): Compatibility {
  const brand = vehicleNameKey(sel.brand || '');
  const model = vehicleNameKey(sel.model || '');
  const engine = vehicleNameKey(sel.engine || '');
  if (!brand) return COMPAT.none;

  let likely = false;
  for (const f of fitments || []) {
    if (!f) continue;
    const brandOk = vehicleNameKey(f.brand || '') === brand;
    if (!brandOk) continue;
    const modelOk = !model || vehicleNameKey(f.model || '') === model;
    const yearOk = !sel.year || (sel.year >= f.yearFrom && sel.year <= f.yearTo);
    if (!modelOk || !yearOk) continue;

    const fEngine = vehicleNameKey(f.engine || '');
    if (engine && fEngine && fEngine !== engine) continue;
    if (model && sel.year && engine) return COMPAT.exact;
    likely = true; // eksik araç bilgisi varsa kesin eşleşme gösterme
  }
  return likely ? COMPAT.likely : COMPAT.none;
}

export function compatFromLevel(level: MatchLevel | null | undefined): Compatibility {
  return COMPAT[level ?? 'none'] ?? COMPAT.none;
}

// ── Normalize (DB satırı -> SparePart) ──────────────────────
function normalize(row: any): SparePart {
  return {
    ...row,
    price: row.price != null && Number.isFinite(Number(row.price)) ? Number(row.price) : null,
    compatible_vehicles: Array.isArray(row.compatible_vehicles)
      ? row.compatible_vehicles
      : [],
    technical_specs:
      row.technical_specs && typeof row.technical_specs === 'object'
        ? row.technical_specs
        : {},
  };
}

/** Seller titles may already include the manufacturer. */
export function partDisplayName(part: Pick<SparePart, 'brand' | 'name'>): string {
  const brand = part.brand?.trim() ?? '';
  const name = part.name.trim();
  const normalized = name.toLocaleLowerCase('tr-TR');
  const prefix = brand.toLocaleLowerCase('tr-TR');
  if (!brand || normalized === prefix || normalized.startsWith(`${prefix} `)) return name;
  return `${brand} ${name}`;
}

// ── Araç seçimine göre uyumlu parça araması ─────────────────
export async function searchPartsByVehicle(
  sel: VehicleSelection,
  category?: string
): Promise<SparePartResult[]> {
  if (!sel.brand) return [];

  // 1) Birincil yol: RPC (uyumluluk seviyesi DB'de hesaplanır)
  try {
    const { data, error } = await supabase.rpc('search_compatible_parts', {
      p_brand: sel.brand,
      p_model: sel.model ?? null,
      p_year: sel.year ?? null,
      p_engine: sel.engine ?? null,
      p_category: category && category !== 'all' ? category : null,
    });
    if (!error && Array.isArray(data)) {
      return data.map((row: any) => ({
        ...normalize(row),
        compatibility: checkCompatibility(normalize(row).compatible_vehicles, sel),
      })).filter((part) => part.compatibility.level !== 'none');
    }
    if (error && error.code !== 'PGRST202' && error.code !== '42883') throw error;
  } catch (_) {
    if ((_ as any)?.code !== 'PGRST202' && (_ as any)?.code !== '42883') throw _;
  }

  // 2) Fallback: tablo sorgusu + JS eşleştirme
  let q = supabase.from('spare_parts').select('*').eq('is_active', true);
  // brand alanı parça üreticisidir; uyumluluk compatible_vehicles içinde.
  // Bu yüzden tümünü çekip JS'te filtreliyoruz (küçük katalog varsayımı).
  if (category && category !== 'all') q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw error;
  if (!data) return [];

  return data
    .map(normalize)
    .map((p) => ({ ...p, compatibility: checkCompatibility(p.compatible_vehicles, sel) }))
    .filter((p) => p.compatibility.level !== 'none')
    .sort((a, b) =>
      a.compatibility.level === b.compatibility.level
        ? a.name.localeCompare(b.name, 'tr')
        : a.compatibility.level === 'exact' ? -1 : 1
    );
}

// ── OEM / referans kodu ile arama ───────────────────────────
export async function searchPartsByOEM(code: string): Promise<SparePart[]> {
  const clean = safeSearchTerm(code);
  if (!clean) return [];
  // oem_code veya cross_reference (dizi) içinde eşleşme
  const { data, error } = await supabase
    .from('spare_parts')
    .select('*')
    .eq('is_active', true)
    .or(`oem_code.ilike.%${clean}%,cross_reference.cs.{"${clean}"}`);
  if (error) throw error;
  if (!data) return [];
  return data.map(normalize);
}

export async function getPartById(id: string): Promise<SparePart | null> {
  const { data, error } = await supabase.from('spare_parts').select('*').eq('id', id).eq('is_active', true).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return normalize(data);
}

/** Pazaryeri liste ekranı için isim OEM marka ve kategori araması. */
export function safeSearchTerm(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s.\-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export function matchesPartQuery(part: SparePart, value: string): boolean {
  const term = safeSearchTerm(value).toLocaleLowerCase('tr-TR');
  if (!term) return true;
  return [part.name, part.brand, part.oem_code, ...(part.cross_reference ?? [])]
    .some(text => (text ?? '').toLocaleLowerCase('tr-TR').includes(term));
}

export async function listMarketplaceParts(params?: {
  query?: string;
  category?: string;
  limit?: number;
}): Promise<SparePart[]> {
  let q = supabase
    .from('spare_parts')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 50);

  if (params?.category && params.category !== 'all') q = q.eq('category', params.category);
  const term = safeSearchTerm(params?.query ?? '');
  if (term) q = q.or(`name.ilike.%${term}%,oem_code.ilike.%${term}%,brand.ilike.%${term}%,cross_reference.cs.{"${term}"}`);

  const { data, error } = await q;
  if (error) throw error;
  if (!data) return [];
  return data.map(normalize);
}

// ── Cascading dropdown yardımcıları ─────────────────────────
/** Seçili markaya ait katalogdaki distinct modelleri döndürür. */
export async function getModelsForBrand(brand: string): Promise<string[]> {
  const { data } = await supabase.from('spare_parts').select('compatible_vehicles');
  const set = new Set<string>();
  (data ?? []).forEach((row: any) => {
    (row.compatible_vehicles ?? []).forEach((f: Fitment) => {
      if (vehicleNameKey(f.brand || '') === vehicleNameKey(brand) && f.model) {
        set.add(f.model);
      }
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
}

/** Seçili marka+model için katalogdaki distinct motor tiplerini döndürür. */
export async function getEnginesFor(brand: string, model?: string): Promise<string[]> {
  const { data } = await supabase.from('spare_parts').select('compatible_vehicles');
  const set = new Set<string>();
  (data ?? []).forEach((row: any) => {
    (row.compatible_vehicles ?? []).forEach((f: Fitment) => {
      const brandOk = vehicleNameKey(f.brand || '') === vehicleNameKey(brand);
      const modelOk = !model || vehicleNameKey(f.model || '') === vehicleNameKey(model);
      if (brandOk && modelOk && f.engine) set.add(f.engine);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
}

// ── "Yanlış Parça Bildir" ───────────────────────────────────
export async function reportWrongPart(params: {
  partId: string;
  reason: string;
  note?: string;
  vehicleContext?: VehicleSelection | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('part_reports').insert({
    part_id: params.partId,
    user_id: userData?.user?.id ?? null,
    reason: params.reason,
    note: params.note ?? null,
    vehicle_context: params.vehicleContext ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ============================================================
// AI Uyumluluk Asistanı
// "Bu parça X model aracımın 2018 versiyonuna uyar mı?" sorusunu,
// parçanın OEM verisini analiz ederek yanıtlar.
// ============================================================
export interface AICompatAnswer {
  verdict: 'uyumlu' | 'kismen' | 'uyumsuz' | 'belirsiz';
  answer: string;
  disclaimer: string;
}

const AI_DISCLAIMER =
  'Bu değerlendirme yapay zeka tarafından, girilen OEM verisine göre üretilmiştir. Kesin montaj için parça numarasını ustanıza doğrulatın.';

/**
 * Deterministik yerel çıkarım — API anahtarı yoksa veya çağrı başarısızsa
 * uyumluluk verisinden güvenilir bir yanıt üretir.
 */
function localCompatAnswer(part: SparePart, sel: VehicleSelection): AICompatAnswer {
  const compat = checkCompatibility(part.compatible_vehicles, sel);
  const carDesc = [sel.brand, sel.model, sel.year, sel.engine].filter(Boolean).join(' ');
  if (compat.level === 'exact') {
    return {
      verdict: 'uyumlu',
      answer: `Evet. "${part.name}" (OEM: ${part.oem_code}) parçası ${carDesc} aracınızla birebir uyumlu görünüyor. Uyumluluk kaydı marka, model, yıl ve motor tipiyle eşleşiyor.`,
      disclaimer: AI_DISCLAIMER,
    };
  }
  if (compat.level === 'likely') {
    return {
      verdict: 'kismen',
      answer: `Muhtemelen uyar. Marka, model ve yıl eşleşiyor ancak motor tipi kaydımızda birebir doğrulanamadı. ${carDesc} için OEM ${part.oem_code} numarasını ustanıza teyit ettirmeniz önerilir.`,
      disclaimer: AI_DISCLAIMER,
    };
  }
  const brands = Array.from(new Set(part.compatible_vehicles.map((f) => `${f.brand} ${f.model}`)));
  return {
    verdict: 'uyumsuz',
    answer: `Kayıtlarımıza göre bu parça ${carDesc} ile uyumlu görünmüyor. Bu OEM numarası şu araçlar için tanımlı: ${brands.join(', ')}. Doğru parçayı bulmak için araç bilgilerinizle arama yapın.`,
    disclaimer: AI_DISCLAIMER,
  };
}

export async function askPartCompatibility(
  question: string,
  part: SparePart,
  sel: VehicleSelection
): Promise<AICompatAnswer> {
  const payload = {
    part: {
      name: part.name,
      oem_code: part.oem_code,
      compatible_vehicles: part.compatible_vehicles,
    },
    userVehicle: sel,
    userQuestion: question,
  };

  try {
    const { data, error } = await supabase.functions.invoke('ai-assistant', {
      body: { action: 'part_compatibility', payload },
    });
    if (error || !data?.result) throw error ?? new Error('parse');
    const parsed = data.result;
    return {
      verdict: parsed.verdict ?? 'belirsiz',
      answer: parsed.answer ?? '',
      disclaimer: parsed.disclaimer ?? AI_DISCLAIMER,
    };
  } catch (_) {
    // Hata halinde güvenli yerel yanıt
    return localCompatAnswer(part, sel);
  }
}
