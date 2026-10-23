import { supabase } from './supabase';
import { VEHICLE_BRANDS } from './vehicleBrands';

export const FORUM_CATEGORIES = ['Tümü', 'Soru', 'Sohbet', 'Bakım', 'Arıza', 'Modifiye', 'Deneyim'] as const;
export type ForumCategory = Exclude<(typeof FORUM_CATEGORIES)[number], 'Tümü'>;
export const FORUM_GROUPS = [{ id: 'general', name: 'Genel' }, ...VEHICLE_BRANDS.map(({ id, name }) => ({ id, name }))];
export const FORUM_PAGE_SIZE = 30;
export interface ForumPost {
  id: string; user_id: string | null; author_name: string; title: string; body: string;
  category: ForumCategory; brand_group?: string | null; vehicle_label?: string | null;
  created_at: string; comments_count: number; likes_count: number; liked_by_me?: boolean;
}
export interface ForumComment {
  id: string; post_id: string; user_id: string | null; author_name: string; content: string; created_at: string;
}
const POST_SELECT = '*, profiles:profile_directory!user_id(full_name), forum_comments(count), forum_likes(count)';
function relationName(value: any): string { return (Array.isArray(value) ? value[0]?.full_name : value?.full_name) || 'SanayiX Üyesi'; }
function relationCount(value: any): number { return Number((Array.isArray(value) ? value[0]?.count : value?.count) ?? 0); }
function normalizePost(row: any): ForumPost {
  return { ...row, author_name: relationName(row.profiles), comments_count: relationCount(row.forum_comments), likes_count: relationCount(row.forum_likes) };
}
function normalizeComment(row: any): ForumComment { return { ...row, author_name: relationName(row.profiles) }; }
export function forumGroupName(id?: string | null) { return FORUM_GROUPS.find(group => group.id === id)?.name || 'Genel'; }
function validGroup(group: string) {
  if (!FORUM_GROUPS.some(item => item.id === group)) throw new Error('Geçerli bir marka grubu seçin.');
  return group === 'general' ? null : group;
}
export class ForumAuthRequiredError extends Error {
  constructor() { super('Foruma katılmak için giriş yapın.'); this.name = 'ForumAuthRequiredError'; }
}
async function currentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error?.name === 'AuthSessionMissingError' || (!error && !user)) throw new ForumAuthRequiredError();
  if (error) throw error;
  if (!user) throw new ForumAuthRequiredError();
  return user.id;
}
export async function listForumPosts(category = 'Tümü', query = '', group = 'all', page = 0): Promise<ForumPost[]> {
  await currentUserId();
  let request = supabase.from('forum_posts').select(POST_SELECT).order('created_at', { ascending: false }).order('id', { ascending: false });
  if (category !== 'Tümü') request = request.eq('category', category);
  if (group !== 'all') { const brand = validGroup(group); request = brand ? request.eq('brand_group', brand) : request.is('brand_group', null); }
  // Restrict search grammar so punctuation cannot change the PostgREST filter.
  const needle = query.trim().slice(0, 100).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (needle) request = request.or(`title.ilike.%${needle}%,body.ilike.%${needle}%`);
  const offset = Math.max(0, Math.floor(page)) * FORUM_PAGE_SIZE;
  const { data, error } = await request.range(offset, offset + FORUM_PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []).map(normalizePost);
}
export async function createForumPost(input: { title: string; body: string; category: ForumCategory; vehicleLabel?: string; brandGroup: string }): Promise<ForumPost> {
  const title = input.title.trim(), body = input.body.trim();
  if (title.length < 6 || title.length > 100 || body.length < 15 || body.length > 2000) throw new Error('Başlık 6–100, açıklama 15–2000 karakter olmalı.');
  if (!FORUM_CATEGORIES.some(category => category !== 'Tümü' && category === input.category)) throw new Error('Geçerli bir konu türü seçin.');
  const brand = validGroup(input.brandGroup);
  const userId = await currentUserId();
  const { data, error } = await supabase.from('forum_posts').insert({ user_id: userId, title, body, category: input.category, brand_group: brand, vehicle_label: input.vehicleLabel?.trim().slice(0, 80) || null }).select(POST_SELECT).single();
  if (error) throw error;
  if (!data) throw new Error('Konu kaydedilemedi.');
  return normalizePost(data);
}
export async function getForumPost(id: string): Promise<ForumPost | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('forum_posts').select(POST_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const post = normalizePost(data);
  const like = await supabase.from('forum_likes').select('post_id').eq('post_id', id).eq('user_id', userId).maybeSingle();
  if (like.error) throw like.error;
  return { ...post, liked_by_me: Boolean(like.data) };
}
export async function listForumComments(postId: string, page = 0): Promise<ForumComment[]> {
  await currentUserId();
  const offset = Math.max(0, Math.floor(page)) * FORUM_PAGE_SIZE;
  const { data, error } = await supabase.from('forum_comments').select('*, profiles:profile_directory!user_id(full_name)').eq('post_id', postId).order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + FORUM_PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []).map(normalizeComment);
}
export async function addForumComment(postId: string, content: string): Promise<ForumComment> {
  const text = content.trim();
  if (text.length < 2 || text.length > 1000) throw new Error('Yanıt 2–1000 karakter olmalı.');
  const userId = await currentUserId();
  const { data, error } = await supabase.from('forum_comments').insert({ post_id: postId, user_id: userId, content: text }).select('*, profiles:profile_directory!user_id(full_name)').single();
  if (error) throw error;
  if (!data) throw new Error('Yanıt kaydedilemedi.');
  return normalizeComment(data);
}
export async function toggleForumLike(post: ForumPost): Promise<{ liked: boolean; count: number }> {
  const userId = await currentUserId();
  const existing = await supabase.from('forum_likes').select('post_id').eq('post_id', post.id).eq('user_id', userId).maybeSingle();
  if (existing.error) throw existing.error;
  const liked = !existing.data;
  const result = liked
    ? await supabase.from('forum_likes').insert({ post_id: post.id, user_id: userId })
    : await supabase.from('forum_likes').delete().eq('post_id', post.id).eq('user_id', userId);
  if (result.error) throw result.error;
  return { liked, count: Math.max(0, post.likes_count + (liked ? 1 : -1)) };
}
export function forumTimeAgo(value: string) {
  const time = Date.parse(value); if (!Number.isFinite(time)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return 'şimdi'; if (minutes < 60) return `${minutes} dk`; if (minutes < 1440) return `${Math.floor(minutes / 60)} sa`; return `${Math.floor(minutes / 1440)} gün`;
}
