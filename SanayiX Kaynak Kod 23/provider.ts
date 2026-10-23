import { vehicleNameKey } from '../_shared/vehicleNames.ts';
export type CatalogQuery = { kind: 'brands' | 'models'; offset: number; q?: string; brandId?: number; year?: number };
export class CatalogError extends Error {
  code: string; status: number;
  constructor(code: string, status: number, message: string) { super(message); this.code = code; this.status = status; }
}
export function parseCatalogQuery(input: any): CatalogQuery {
  const bad = () => { throw new CatalogError('CATALOG_INVALID_INPUT', 400, 'Araç seçimi geçersiz.'); };
  if (!input || !['brands', 'models'].includes(input.kind)) return bad();
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return bad();
  if (input.kind === 'models' && (!Number.isSafeInteger(input.brandId) || input.brandId <= 0)) return bad();
  if (input.year !== undefined && (!Number.isInteger(input.year) || input.year < 1996 || input.year > new Date().getFullYear() + 1)) return bad();
  if (input.q !== undefined && (typeof input.q !== 'string' || input.q.length > 100)) return bad();
  return { kind: input.kind, offset, q: input.q?.trim(), brandId: input.kind === 'models' ? input.brandId : undefined, year: input.kind === 'models' ? input.year : undefined };
}
type CatalogRow = { id: number; name: string };
// vPIC's unfiltered endpoints mix passenger cars with motorcycles, trailers,
// heavy trucks and other equipment. Include passenger cars AND MPVs (SUVs).
const vehicleTypes = [{ path: 'car', id: 2 }, { path: 'multipurpose', id: 7 }];
const cache = new Map<string, { expires: number; rows: CatalogRow[] }>();
const pending = new Map<string, Promise<CatalogRow[]>>();
export async function fetchCatalogPage(query: CatalogQuery, request: typeof fetch = fetch) {
  const cacheKey = `${query.kind}:${query.brandId ?? ''}:${query.year ?? ''}:passenger-v1`;
  const load = async () => {
    const groups = await Promise.all(vehicleTypes.map(async type => {
      // ID endpoints prevent partial make-name matching from mixing brands.
      const path = query.kind === 'brands' ? `GetMakesForVehicleType/${type.path}`
        : `GetModelsForMakeIdYear/makeId/${query.brandId}${query.year ? `/modelyear/${query.year}` : ''}/vehicletype/${type.path}`;
      const response = await request(`https://vpic.nhtsa.dot.gov/api/vehicles/${path}?format=json`, {
        signal: AbortSignal.timeout(25000), headers: { Accept: 'application/json' }, redirect: 'error',
      });
      if (!response.ok) throw new CatalogError('CATALOG_UNAVAILABLE', response.status === 429 ? 429 : 502, 'Araç kataloğuna şu anda ulaşılamıyor. Lütfen tekrar deneyin.');
      const body = await response.json();
      if (!Array.isArray(body.Results) || body.Count !== body.Results.length) throw new CatalogError('CATALOG_BAD_RESPONSE', 502, 'Araç kataloğu yanıtı okunamadı.');
      return body.Results.map((row: any): CatalogRow => {
        // vPIC uses different make field names in the typed makes response.
        const id = query.kind === 'brands' ? row.MakeId : row.Model_ID;
        const name = query.kind === 'brands' ? row.MakeName : row.Model_Name;
        if (!Number.isSafeInteger(id) || id <= 0 || typeof name !== 'string' || !name.trim() ||
            row.VehicleTypeId !== type.id || (query.kind === 'models' && row.Make_ID !== query.brandId)) {
          throw new CatalogError('CATALOG_BAD_RESPONSE', 502, 'Araç bilgisi okunamadı.');
        }
        return { id, name: name.trim() };
      });
    }));
    const rows = new Map<number, CatalogRow>();
    for (const row of groups.flat()) rows.set(row.id, row);
    const result = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { expires: Date.now() + 86400000, rows: result });
    return result;
  };
  const cached = cache.get(cacheKey);
  let all: CatalogRow[];
  if (cached && cached.expires > Date.now()) all = cached.rows;
  else {
    let task = pending.get(cacheKey);
    if (!task) { task = load(); pending.set(cacheKey, task); }
    try { all = await task; } finally { pending.delete(cacheKey); }
  }
  const filtered = all.filter(row => !query.q || vehicleNameKey(row.name).includes(vehicleNameKey(query.q)));
  const items = filtered.slice(query.offset, query.offset + 100);
  return { items, total: filtered.length, nextOffset: query.offset + items.length < filtered.length ? query.offset + items.length : null, source: 'NHTSA vPIC', vehicleTypes: ['Passenger Car', 'MPV'] };
}
