import { supabase } from './supabase';

export interface ChatMessage {
  id: string; conversation_id: string; sender_id: string;
  content: string; created_at: string; read: boolean;
}
export type PendingChatMessage = Pick<ChatMessage, 'id' | 'conversation_id' | 'sender_id' | 'content'>;
export const CHAT_PAGE_SIZE = 50;
export type ChatEvent = { message: ChatMessage; insert: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function chatUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Mesajlar için yeniden giriş yapın.');
  return data.user.id;
}

export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const rows = new Map(current.map(row => [row.id, row]));
  for (const row of incoming) rows.set(row.id, { ...row, read: row.read || rows.get(row.id)?.read || false });
  return [...rows.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** Receipts for unloaded old rows must not create a gap in the visible window. */
export function mergeChatPage(page: ChatMessage[], events: ChatEvent[]): ChatMessage[] {
  const ids = new Set([...page.map(row => row.id), ...events.filter(event => event.insert).map(event => event.message.id)]);
  return mergeChatMessages(page, events.filter(event => ids.has(event.message.id)).map(event => event.message));
}

/** Open at the newest messages; older pages use a stable time/id cursor. */
export async function readChatPage(conversationId: string, before?: ChatMessage) {
  const userId = await chatUser();
  if (!UUID.test(conversationId)) throw new Error('Sohbet bulunamadı.');
  const conversation = await supabase.from('conversations').select('id,user_id,mechanic_id').eq('id', conversationId).maybeSingle();
  if (conversation.error) throw conversation.error;
  if (!conversation.data || ![conversation.data.user_id, conversation.data.mechanic_id].includes(userId)) throw new Error('Bu sohbete erişilemiyor.');
  let query = supabase.from('messages').select('*').eq('conversation_id', conversationId);
  if (before) {
    if (before.conversation_id !== conversationId || !UUID.test(before.id) || !Number.isFinite(Date.parse(before.created_at)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(before.created_at)) throw new Error('Mesaj sayfası geçersiz.');
    const time = before.created_at; // Preserve database microseconds at page boundaries.
    query = query.or(`created_at.lt.${time},and(created_at.eq.${time},id.lt.${before.id})`);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(CHAT_PAGE_SIZE + 1);
  if (error) throw error;
  return { userId, messages: mergeChatMessages([], (data ?? []).slice(0, CHAT_PAGE_SIZE)), hasMore: (data?.length ?? 0) > CHAT_PAGE_SIZE };
}

/** Only the received rows that were loaded while the chat was open get a receipt. */
export async function markChatRead(conversationId: string, userId: string, messages: ChatMessage[], canRead: () => boolean) {
  if (!canRead()) return;
  const ids = messages.filter(row => row.conversation_id === conversationId && row.sender_id !== userId && !row.read).map(row => row.id);
  if (!ids.length) return;
  if (await chatUser() !== userId || !canRead()) return;
  const { error } = await supabase.from('messages').update({ read: true })
    .eq('conversation_id', conversationId).neq('sender_id', userId).eq('read', false).in('id', ids);
  if (error) throw error;
}

/** Reuse the same id after a lost response so retrying cannot insert a duplicate. */
async function persistChatMessage(pending: PendingChatMessage): Promise<ChatMessage> {
  if (!UUID.test(pending.id) || !UUID.test(pending.conversation_id) || pending.content.trim().length < 1 || pending.content.length > 1000) throw new Error('Mesaj 1–1000 karakter olmalı ve geçerli bir sohbete ait olmalı.');
  if (await chatUser() !== pending.sender_id) throw new Error('Oturum değişti. Yeniden giriş yapın.');
  let failure: unknown;
  try {
    const { data, error } = await supabase.from('messages').insert(pending).select('*').single();
    if (error) throw error;
    if (!data) throw new Error('Mesajın kaydı doğrulanamadı.');
    return data;
  } catch (error) { failure = error; }
  // A timeout can happen after commit. Confirm that exact message before retrying.
  try {
    const { data, error } = await supabase.from('messages').select('*')
      .eq('id', pending.id).eq('conversation_id', pending.conversation_id).eq('sender_id', pending.sender_id).maybeSingle();
    if (!error && data && data.content === pending.content) return data;
  } catch { /* keep the original message and id available for an explicit retry */ }
  throw failure;
}

export async function sendChatMessage(pending: PendingChatMessage): Promise<ChatMessage> {
  const message = await persistChatMessage(pending);
  // A delayed retry must not replace the preview of a more recent message.
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(message.created_at)) {
    try {
      await supabase.from('conversations').update({ last_message: message.content, last_message_at: message.created_at })
        .eq('id', message.conversation_id)
        .or(`last_message_at.is.null,last_message_at.lte.${message.created_at}`);
    } catch { /* The message itself is saved; the inbox also reads its latest row. */ }
  }
  return message;
}

export function chatDateLabel(value: string, now = new Date()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (key(date) === key(now)) return 'Bugün';
  if (key(date) === key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Dün';
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
