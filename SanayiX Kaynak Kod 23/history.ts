import { supabase } from '../supabase';

export interface DriveInterval {
  id: string;
  distance_km: number;
  started_at: string;
  ended_at: string;
}

/** Read every page; a database row limit must never silently lower mileage. */
export async function readDriveHistory(options: {
  start?: Date; end?: Date; vehicleId?: string; automaticOnly?: boolean;
} = {}): Promise<DriveInterval[]> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Oturum bulunamadı.');
  const rows: DriveInterval[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from('drives')
      .select('id,distance_km,started_at,ended_at')
      .eq('user_id', data.user.id);
    if (options.vehicleId) query = query.eq('vehicle_id', options.vehicleId);
    if (options.automaticOnly) query = query.eq('source', 'auto');
    if (options.start) query = query.gt('ended_at', options.start.toISOString());
    if (options.end) query = query.lt('started_at', options.end.toISOString());
    const result = await query.order('id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < pageSize) return rows;
  }
}

/** Share an interval between calendar days, including trips crossing midnight. */
export function intervalKm(drive: DriveInterval, start: Date, end: Date): number {
  const distance = Number(drive.distance_km);
  const from = Date.parse(drive.started_at), to = Date.parse(drive.ended_at);
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  const overlap = Math.max(0, Math.min(to, end.getTime()) - Math.max(from, start.getTime()));
  return distance * overlap / (to - from);
}
