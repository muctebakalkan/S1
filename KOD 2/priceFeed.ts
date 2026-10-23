import AsyncStorage from '@react-native-async-storage/async-storage';

export const PRICE_SOURCE_URL = 'https://www.petrolofisi.com.tr/akaryakit-fiyatlari';
const CACHE_KEY = 'public_fuel_prices_v1';
const FRESH_MS = 30 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
interface CityPrice { city: string; benzin: number; dizel: number; lpg: number }
interface Snapshot { observedAt: string; prices: CityPrice[] }
let pending: Promise<Snapshot | null> | null = null;
let cache: Snapshot | null = null;

function normalizeCity(value: string): string {
  return value.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** Public city table: tax-inclusive petrol, diesel and LPG columns only. */
export function parsePriceTable(html: string): CityPrice[] {
  const table = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)]
    .map(match => match[0]).find(value => value.includes('data-disctrict-name='));
  const header = table?.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] ?? '';
  const columns = [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
    .map(match => match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
  const expected = ['Şehir', 'V/Max Kurşunsuz 95', 'V/Max Diesel', 'Gazyağı', 'Kalorifer Yakıtı', 'Fuel Oil', 'PO/gaz Otogaz'];
  if (!table || columns.length !== expected.length || columns.some((column, index) => column !== expected[index])) {
    throw new Error('Yakıt kaynağının tablo yapısı değişti.');
  }
  const prices: CityPrice[] = [];
  for (const row of table.matchAll(/<tr\b[^>]*data-disctrict-name="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const values = [...row[2].matchAll(/<span\s+class="with-tax">\s*([0-9]+(?:[.,][0-9]+)?)\s*<\/span>/g)]
      .map(match => Number(match[1].replace(',', '.')));
    if (values.length !== 6) throw new Error('Yakıt fiyatı sütunları doğrulanamadı.');
    const [benzin, dizel, , , , lpg] = values;
    if (![benzin, dizel, lpg].every(value => Number.isFinite(value) && value > 0 && value < 1000)) {
      throw new Error('Yakıt fiyatı doğrulanamadı.');
    }
    prices.push({ city: normalizeCity(row[1]), benzin, dizel, lpg });
  }
  if (prices.length < 70 || prices.length > 100 || new Set(prices.map(p => p.city)).size !== prices.length) {
    throw new Error('İl fiyatları eksik veya tekrarlı.');
  }
  return prices;
}

function validSnapshot(value: Snapshot | null): value is Snapshot {
  if (!value || !Array.isArray(value.prices) || value.prices.length < 70 || value.prices.length > 100) return false;
  const age = Date.now() - Date.parse(value.observedAt);
  return Number.isFinite(age) && age >= 0 && age <= MAX_AGE_MS
    && value.prices.every(row => row && typeof row.city === 'string' && row.city.trim().length > 0 && [row.benzin, row.dizel, row.lpg].every(p => Number.isFinite(p) && p > 0 && p < 1000))
    && new Set(value.prices.map(row => row.city)).size === value.prices.length;
}

async function getSnapshot(): Promise<Snapshot | null> {
  if (validSnapshot(cache) && Date.now() - Date.parse(cache.observedAt) < FRESH_MS) return cache;
  if (pending) return pending;
  pending = (async () => {
    if (!cache) {
      try { cache = JSON.parse(await AsyncStorage.getItem(CACHE_KEY) ?? 'null'); } catch { cache = null; }
      if (validSnapshot(cache) && Date.now() - Date.parse(cache.observedAt) < FRESH_MS) return cache;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      // No account, vehicle or location data is sent to the public price source.
      const response = await fetch(PRICE_SOURCE_URL, { signal: controller.signal });
      if (!response.ok) throw new Error('Fiyat kaynağına ulaşılamadı.');
      const html = await response.text();
      if (html.length > 2_000_000) throw new Error('Beklenmeyen fiyat yanıtı.');
      const snapshot = { observedAt: new Date().toISOString(), prices: parsePriceTable(html) };
      cache = snapshot;
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)).catch(() => {});
      return snapshot;
    } catch { return validSnapshot(cache) ? cache : null; }
    finally { clearTimeout(timeout); }
  })();
  try { return await pending; } finally { pending = null; }
}

export async function getPublicFuelPrice(fuelKey: string, city?: string | null) {
  const key = fuelKey === 'hibrit' ? 'benzin' : fuelKey;
  if (key !== 'benzin' && key !== 'dizel' && key !== 'lpg') return null;
  const snapshot = await getSnapshot();
  if (!snapshot) return null;
  const name = city ? normalizeCity(city) : '';
  const local = name ? snapshot.prices.filter(row => row.city === name || row.city.startsWith(`${name} (`)) : [];
  const rows = local.length ? local : snapshot.prices;
  return {
    unitPrice: rows.reduce((sum, row) => sum + row[key], 0) / rows.length,
    unit: 'L', observedAt: snapshot.observedAt,
    source: local.length ? `Petrol Ofisi · ${city}` : 'Petrol Ofisi · il fiyatları ortalaması',
  };
}
