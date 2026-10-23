import type { SupabaseClient } from '@supabase/supabase-js';

export const ACCOUNT_DELETION_CONFIRMATION = 'HESABIMI SİL';
type Client = Pick<SupabaseClient, 'auth' | 'rpc' | 'storage'>;
type Asset = { bucket: string; path: string };
const pending = new WeakMap<object, Promise<string>>();

async function removeAccount(client: Client, confirmation: string, progress?: (message: string) => void): Promise<string> {
  if (confirmation.trim() !== ACCOUNT_DELETION_CONFIRMATION) throw new Error('Onay alanına HESABIMI SİL yazın.');
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error('Hesabınızı silmek için yeniden giriş yapın.');
  const params = { p_confirmation: ACCOUNT_DELETION_CONFIRMATION };
  let previousManifest = '';
  for (let page = 0; page < 200; page++) {
    progress?.('Hesabınıza ait fotoğraf ve dosyalar temizleniyor…');
    const start = await client.rpc('begin_account_deletion', params);
    if (start.error) throw start.error;
    if (start.data?.user_id !== user.id || !Array.isArray(start.data.assets) || typeof start.data.token !== 'string' || !start.data.token) throw new Error('Hesap silme yanıtı doğrulanamadı.');
    const assets: Asset[] = start.data.assets;
    if (assets.some(a => !a || typeof a.bucket !== 'string' || !a.bucket || typeof a.path !== 'string' || !a.path)) {
      throw new Error('Dosya listesi doğrulanamadı.');
    }
    if (!assets.length) {
      progress?.('Hesap ve bağlı kayıtlar siliniyor…');
      const finish = await client.rpc('finish_account_deletion', { ...params, p_deletion_token: start.data.token });
      if (finish.error) throw finish.error;
      if (finish.data?.deleted !== true || finish.data.user_id !== user.id) throw new Error('Hesabın silindiği doğrulanamadı.');
      return user.id;
    }
    const manifest = JSON.stringify(assets);
    if (manifest === previousManifest) throw new Error('Dosya temizliği doğrulanamadı. Silmeyi yeniden deneyin.');
    previousManifest = manifest;
    const groups = new Map<string, string[]>();
    for (const asset of assets) groups.set(asset.bucket, [...(groups.get(asset.bucket) ?? []), asset.path]);
    for (const [bucket, paths] of groups) {
      const removed = await client.storage.from(bucket).remove(paths);
      if (removed.error) throw new Error('Fotoğraflar temizlenemedi. Bağlantınızı kontrol edip silmeyi yeniden deneyin.');
      // Re-read the server manifest; an empty successful response is not deletion.
    }
  }
  throw new Error('Dosya temizliği sürüyor. Kalan dosyalar için silmeyi yeniden deneyin.');
}

/** No caller-supplied user ID. Each step is bound to the server-authenticated user. */
export function deleteCurrentAccount(client: Client, confirmation: string, progress?: (message: string) => void) {
  if (confirmation.trim() !== ACCOUNT_DELETION_CONFIRMATION) return Promise.reject(new Error('Onay alanına HESABIMI SİL yazın.'));
  const running = pending.get(client);
  if (running) return running;
  const work = removeAccount(client, confirmation, progress).finally(() => pending.delete(client));
  pending.set(client, work);
  return work;
}
