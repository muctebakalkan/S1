import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_FUEL_KEY = '@sanayix/fuel-entries-v1';

export interface FuelEntry {
  id: string;
  user_id: string | null;
  vehicle_id?: string | null;
  liters: number;
  amount: number;
  price_per_liter: number;
  odometer_km?: number | null;
  station?: string | null;
  filled_at: string;
  created_at: string;
  is_local?: boolean;
}

export interface FuelStats {
  totalAmount: number;
  totalLiters: number;
  averagePrice: number;
  averageConsumption: number | null;
  fillCount: number;
}

async function loadLocalEntries(userId: string): Promise<FuelEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_FUEL_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    // Preserve legacy offline records, but never expose another account's data.
    return Array.isArray(rows) ? rows.filter(row => row?.user_id === userId).map(row => ({ ...row, is_local: true })) : [];
  } catch { return []; }
}

export async function listFuelEntries(): Promise<FuelEntry[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Yakıt kayıtlarını görmek için giriş yapın.');
  if (user) {
    const { data, error } = await supabase
      .from('fuel_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('filled_at', { ascending: false })
      .limit(120);
    if (error) throw error;
    if (data) {
      const remote = data.map((row: any) => ({
        ...row,
        liters: Number(row.liters) || 0,
        amount: Number(row.amount) || 0,
        price_per_liter: Number(row.price_per_liter) || 0,
        odometer_km: row.odometer_km == null ? null : Number(row.odometer_km),
      }));
      const oldLocal = await loadLocalEntries(user.id);
      return [...remote, ...oldLocal.filter(row => !remote.some((item: FuelEntry) => item.id === row.id))]
        .sort((a,b) => Date.parse(b.filled_at)-Date.parse(a.filled_at));
    }
  }
  return [];
}

export async function addFuelEntry(input: {
  vehicleId?: string | null;
  liters: number;
  amount: number;
  odometerKm?: number | null;
  station?: string;
  filledAt?: string;
}): Promise<FuelEntry> {
  if (!Number.isFinite(input.liters) || input.liters <= 0 || !Number.isFinite(input.amount) || input.amount <= 0 ||
      (input.odometerKm != null && (!Number.isFinite(input.odometerKm) || input.odometerKm < 0))) throw new Error('Litre, tutar ve kilometre değerlerini kontrol edin.');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Yakıt kaydı eklemek için giriş yapın.');
  const pricePerLiter = input.liters > 0 ? input.amount / input.liters : 0;
  const payload = {
    user_id: user?.id ?? null,
    vehicle_id: input.vehicleId ?? null,
    liters: input.liters,
    amount: input.amount,
    price_per_liter: pricePerLiter,
    odometer_km: input.odometerKm ?? null,
    station: input.station?.trim() || null,
    filled_at: input.filledAt ?? new Date().toISOString(),
  };

  if (user) {
    const { data, error } = await supabase.from('fuel_entries').insert(payload).select('*').single();
    if (error) throw error;
    if (!error && data) {
      return {
        ...data,
        liters: Number(data.liters),
        amount: Number(data.amount),
        price_per_liter: Number(data.price_per_liter),
        odometer_km: data.odometer_km == null ? null : Number(data.odometer_km),
      };
    }
  }

  throw new Error('Yakıt kaydı kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.');
}

export function calculateFuelStats(entries: FuelEntry[]): FuelStats {
  const now = new Date();
  const monthly = entries.filter((entry) => {
    const date = new Date(entry.filled_at);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const totalAmount = monthly.reduce((sum, entry) => sum + entry.amount, 0);
  const totalLiters = monthly.reduce((sum, entry) => sum + entry.liters, 0);
  const orderedWithKm = entries
    .filter((entry) => Number(entry.odometer_km) > 0)
    .sort((a, b) => Date.parse(a.filled_at) - Date.parse(b.filled_at));

  let averageConsumption: number | null = null;
  if (orderedWithKm.length >= 2) {
    const previous = orderedWithKm[orderedWithKm.length - 2];
    const latest = orderedWithKm[orderedWithKm.length - 1];
    const distance = Number(latest.odometer_km) - Number(previous.odometer_km);
    if (previous.vehicle_id && previous.vehicle_id === latest.vehicle_id && distance > 10 && latest.liters > 0) averageConsumption = (latest.liters / distance) * 100;
  }

  return {
    totalAmount,
    totalLiters,
    averagePrice: totalLiters > 0 ? totalAmount / totalLiters : 0,
    averageConsumption,
    fillCount: monthly.length,
  };
}
