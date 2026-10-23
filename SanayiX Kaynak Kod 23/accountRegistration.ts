import type { SupabaseClient, User } from '@supabase/supabase-js';

const registrationText = (value: unknown, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RegistrationClient = Pick<SupabaseClient, 'from' | 'auth'>;
const completingAccounts = new WeakMap<object, Map<string, Promise<void>>>();

function registrationAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99999999.99) throw new Error('Hizmet fiyatını kontrol edin.');
  return Math.round(n * 100) / 100;
}

async function insertRegistrationRow(client: RegistrationClient, table: string, values: Record<string, unknown>, key: string, ownerKey: string, userId: string) {
  const { error } = await client.from(table).insert(values);
  if (!error) return;
  if (error.code !== '23505') throw error;
  // Only the same saved record counts as a successful retry.
  const saved = await client.from(table).select(ownerKey).eq(key, values[key]).maybeSingle();
  if (saved.error) throw saved.error;
  const row = saved.data as Record<string, unknown> | null;
  if (row?.[ownerKey] !== userId) throw new Error('Kayıt doğrulanamadı. Lütfen yeniden giriş yapın.');
}

function registrationRows(user: Pick<User, 'id' | 'user_metadata'>) {
  const role = user.user_metadata?.registration_role;
  if (role !== 'user' && role !== 'mechanic') return;
  const draft = user.user_metadata?.account_registration;
  if (!draft) return; // A completed registration no longer has a draft.
  const fullName = registrationText(draft.full_name);
  if (!fullName) throw new Error('Hesap kayıt bilgileri eksik.');
  let vehicle: Record<string, unknown> | null = null;
  let mechanic: Record<string, unknown> | null = null;
  const services: Record<string, unknown>[] = [];
  if (role === 'user') {
    const v = draft.vehicle;
    const year = Number(v?.year);
    if (!v || !uuidPattern.test(v.id) || !registrationText(v.brand) || !registrationText(v.model) ||
        !Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1 ||
        !['Benzin', 'Dizel', 'LPG', 'Hibrit', 'Elektrik'].includes(v.fuel_type)) {
      throw new Error('Araç kayıt bilgileri eksik veya geçersiz.');
    }
    const mileage = v.mileage == null ? null : Number(v.mileage);
    if (mileage != null && (!Number.isInteger(mileage) || mileage < 0 || mileage > 10000000)) throw new Error('Araç kilometresini kontrol edin.');
    const nextServiceKm = v.next_service_km == null ? null : Number(v.next_service_km);
    if (nextServiceKm != null && (!Number.isInteger(nextServiceKm) || nextServiceKm < 0 || nextServiceKm > 10000000)) throw new Error('Sonraki bakım kilometresini kontrol edin.');
    const lastServiceDate = registrationText(v.last_service_date, 30);
    if (lastServiceDate && (!/^\d{4}-\d{2}-\d{2}$/.test(lastServiceDate) || !Number.isFinite(Date.parse(lastServiceDate)) || new Date(lastServiceDate).toISOString().slice(0, 10) !== lastServiceDate)) throw new Error('Bakım tarihini yıl-ay-gün şeklinde girin.');
    vehicle = { id: v.id, user_id: user.id, brand: registrationText(v.brand, 100), model: registrationText(v.model, 100),
      year: String(year), engine: registrationText(v.engine, 100) || null, fuel_type: v.fuel_type,
      plate: registrationText(v.plate, 24) || null, mileage,
      gear_type: registrationText(v.gear_type, 30) || null,
      last_service_date: lastServiceDate || null, next_service_km: nextServiceKm };
  } else {
    const city = registrationText(draft.city, 100), address = registrationText(draft.address, 500);
    const specialties = Array.isArray(draft.specialties) ? draft.specialties.map((s: unknown) => registrationText(s, 100)).filter(Boolean).slice(0, 20) : [];
    if (!city || !address || !specialties.length) throw new Error('Usta kayıt bilgileri eksik.');
    if ((draft.latitude != null || draft.longitude != null) && (!Number.isFinite(draft.latitude) || Math.abs(draft.latitude)>90 || !Number.isFinite(draft.longitude) || Math.abs(draft.longitude)>180)) throw new Error('İşyeri konumunu yeniden seçin.');
    mechanic = { latitude: draft.latitude ?? null, longitude: draft.longitude ?? null, user_id: user.id, full_name: fullName, city, address, district: registrationText(draft.district, 100) || null,
      specialty: specialties[0], specialties, experience_years: registrationText(draft.experience_years, 10) || null,
      bio: registrationText(draft.bio, 2000) || null, phone: registrationText(draft.phone, 32) || null, is_available: true };
    for (const service of (Array.isArray(draft.services) ? draft.services : []).slice(0, 30)) {
      if (!uuidPattern.test(service.id) || !registrationText(service.title)) throw new Error('Hizmet kayıt bilgileri geçersiz.');
      const min = registrationAmount(service.min_price), max = registrationAmount(service.max_price);
      if (min != null && max != null && min > max) throw new Error('Hizmet fiyat aralığını kontrol edin.');
      services.push({ id: service.id, mechanic_id: user.id, title: registrationText(service.title), min_price: min, max_price: max });
    }
  }
  return { role, draft, fullName, vehicle, mechanic, services };
}

export function validateAccountRegistration(role: 'user' | 'mechanic', draft: unknown) {
  registrationRows({ id: 'pending-registration', user_metadata: { registration_role: role, account_registration: draft } });
}

async function finishAccountRegistration(client: RegistrationClient, user: User) {
  const rows = registrationRows(user);
  if (!rows) return;
  const { role, draft, fullName, vehicle, mechanic, services } = rows;
  const read = () => client.from('profiles').select('id,role').eq('id', user.id).maybeSingle();
  let saved = await read();
  if (saved.error) throw saved.error;
  if (!saved.data) {
    await insertRegistrationRow(client, 'profiles', { id: user.id, role, full_name: fullName,
      email: user.email || '', phone: registrationText(draft.phone, 32) || null }, 'id', 'id', user.id);
    saved = await read();
    if (saved.error) throw saved.error;
  }
  // Editable user metadata is not permission to change an existing role.
  if (saved.data?.role !== role) return;
  if (vehicle) await insertRegistrationRow(client, 'vehicles', vehicle, 'id', 'user_id', user.id);
  if (mechanic) await insertRegistrationRow(client, 'mechanic_profiles', mechanic, 'user_id', 'user_id', user.id);
  for (const service of services) await insertRegistrationRow(client, 'mechanic_services', service, 'id', 'mechanic_id', user.id);
  const { error } = await client.auth.updateUser({ data: { account_registration: null } });
  if (error) throw error;
}

/** Run only after Supabase supplies an authenticated user/session. */
export function completePendingAccountRegistration(client: RegistrationClient, user: User): Promise<void> {
  let pending = completingAccounts.get(client);
  if (!pending) { pending = new Map(); completingAccounts.set(client, pending); }
  const current = pending.get(user.id);
  if (current) return current;
  const work = finishAccountRegistration(client, user).finally(() => pending!.delete(user.id));
  pending.set(user.id, work);
  return work;
}
