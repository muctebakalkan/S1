import type { AlertButton, AlertOptions } from 'react-native';
export type WebAlert = { id: number; title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
let nextId = 0;
let queue: WebAlert[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export function showWebAlert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
  queue = [...queue, { id: ++nextId, title, message, buttons: buttons?.length ? buttons : [{ text: 'Tamam' }], options }];
  emit();
}
export const getWebAlert = () => queue[0] ?? null;
export function subscribeWebAlert(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function closeWebAlert(id: number) {
  if (queue[0]?.id !== id) return false;
  queue = queue.slice(1); emit(); return true;
}
