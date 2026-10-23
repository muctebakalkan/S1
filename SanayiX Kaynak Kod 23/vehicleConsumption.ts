export interface ConsumptionOption { engine: string; value: number; source: string }

/** Only returns variants for the selected vehicle and fuel. No cross-year or fuzzy matching. */
export async function listConsumptionOptions(client: any, vehicle: { brand: string; model: string; year: string; fuelType: string }): Promise<ConsumptionOption[]> {
  const { brand, model, fuelType } = vehicle;
  const year = Number(vehicle.year);
  const fuel = ({ Benzin: 'benzin', Dizel: 'dizel', LPG: 'lpg', Hibrit: 'hibrit', Elektrik: 'elektrik' } as Record<string, string>)[fuelType];
  if (!brand.trim() || !model.trim() || !/^\d{4}$/.test(vehicle.year) || year < 1900 || year > new Date().getFullYear() + 1 || !fuel) return [];
  const literal = (value: string) => value.trim().replace(/[\\%_]/g, '\\$&');
  const { data, error } = await client.from('vehicle_consumption_defaults')
    .select('engine,consumption_per_100,source').ilike('brand', literal(brand)).ilike('model', literal(model))
    .eq('fuel_type', fuel).eq('is_active', true).lte('year_from', year).gte('year_to', year)
    .order('updated_at', { ascending: false }).limit(100);
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? []).flatMap((row: any) => {
    const engine = typeof row.engine === 'string' ? row.engine.trim() : '';
    const value = Number(row.consumption_per_100);
    const key = engine.toLocaleLowerCase('tr-TR');
    if (!engine || seen.has(key) || !Number.isFinite(value) || value < 1 || value > 50) return [];
    seen.add(key);
    return [{ engine, value, source: typeof row.source === 'string' ? row.source : '' }];
  });
}

/** Shared by both consumption entry screens; null explicitly restores the catalog. */
export async function saveConsumptionPreference(client: any, vehicleId: string, input: string): Promise<number | null> {
  const text = input.trim();
  const value = text === '' ? null : Number(text.replace(',', '.'));
  if (!vehicleId) throw new Error('Önce bir araç seçin.');
  if (value !== null && (!/^\d{1,2}([.,]\d{1,2})?$/.test(text) || !Number.isFinite(value) || value < 1 || value > 50)) throw new Error('100 km tüketimini 1 ile 50 arasında girin.');
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Oturum bulunamadı.');
  if (value === null) {
    const { error } = await client.from('vehicle_fuel_preferences').delete().eq('user_id', auth.user.id).eq('vehicle_id', vehicleId);
    if (error) throw error;
    const check = await client.from('vehicle_fuel_preferences').select('vehicle_id').eq('user_id', auth.user.id).eq('vehicle_id', vehicleId).maybeSingle();
    if (check.error) throw check.error;
    if (check.data) throw new Error('Tüketim tercihi sıfırlanamadı. Tekrar deneyin.');
    return null;
  }
  const { data, error } = await client.from('vehicle_fuel_preferences').upsert({
    user_id: auth.user.id, vehicle_id: vehicleId, custom_consumption_per_100: value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,vehicle_id' }).select('vehicle_id,custom_consumption_per_100').single();
  if (error) throw error;
  if (data?.vehicle_id !== vehicleId || (value === null ? data.custom_consumption_per_100 !== null : Number(data.custom_consumption_per_100) !== value)) throw new Error('Kaydedilen tüketim doğrulanamadı. Tekrar deneyin.');
  return value;
}

export function validateVehicleBasics(input: { brand: string; model: string; year: string; fuelType: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.brand.trim()) errors.brand = 'Araç markası zorunludur.';
  if (!input.model.trim()) errors.model = 'Araç modeli zorunludur.';
  const year = Number(input.year);
  if (!/^\d{4}$/.test(input.year.trim()) || year < 1900 || year > new Date().getFullYear() + 1) errors.year = 'Geçerli bir araç yılı girin.';
  if (!['Benzin', 'Dizel', 'LPG', 'Hibrit', 'Elektrik'].includes(input.fuelType)) errors.fuelType = 'Yakıt türünü seçin.';
  return errors;
}

export function validateVehicleUsage(mileage: string, serviceDate: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^\d+$/.test(mileage.trim()) || Number(mileage) > 10_000_000) errors.mileage = 'Kilometreyi yalnızca rakamlarla, 0 ile 10.000.000 arasında girin.';
  if (serviceDate.trim()) {
    const m = serviceDate.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const date = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
    if (!m || !date || date.getFullYear() !== Number(m[3]) || date.getMonth() !== Number(m[2]) - 1 || date.getDate() !== Number(m[1]) || date.getFullYear() < 1900 || date.getTime() > Date.now()) errors.lastServiceDate = 'Geçerli bir geçmiş bakım tarihi girin (GG.AA.YYYY).';
  }
  return errors;
}
