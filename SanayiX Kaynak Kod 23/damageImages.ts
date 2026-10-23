import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const BUCKET = 'damage-images';

export async function uploadDamageImage(params: {
  base64: string;
  userId: string;
  requestId: string;
}): Promise<string> {
  const path = `${params.userId}/${params.requestId}/photo.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(params.base64), {
      contentType: 'image/jpeg',
      upsert: false,
    });
  if (error) throw new Error(`Fotoğraf yüklenemedi: ${error.message}`);
  return path;
}

export async function removeDamageImage(path: string | null | undefined) {
  if (!path || /^(https?:|file:|data:)/i.test(path)) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function resolveDamageImageUrl(value: string | null | undefined) {
  if (!value || /^file:/i.test(value)) return null;
  if (/^(https?:|data:)/i.test(value)) return value;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(value, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
