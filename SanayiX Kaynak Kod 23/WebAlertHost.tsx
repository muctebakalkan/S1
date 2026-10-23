import React, { useSyncExternalStore } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { closeWebAlert, getWebAlert, subscribeWebAlert } from '../lib/webAlert';
import { MARKETPLACE_THEME as T } from '../lib/marketplaceTheme';

/** Visible, accessible web dialogs; native Alert remains unchanged on phones. */
export default function WebAlertHost() {
  const alert = useSyncExternalStore(subscribeWebAlert, getWebAlert, () => null);
  if (Platform.OS !== 'web' || !alert) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={() => {
    if (alert.options?.cancelable && closeWebAlert(alert.id)) alert.options.onDismiss?.();
  }}>
    <View style={s.overlay}><View style={s.card} accessibilityViewIsModal>
      <ScrollView style={{ maxHeight: 400 }}><Text accessibilityRole="header" style={s.title}>{alert.title}</Text>{!!alert.message && <Text style={s.message}>{alert.message}</Text>}</ScrollView>
      <View style={s.actions}>{alert.buttons.map((button, index) => <Pressable key={index} accessibilityRole="button" style={[s.button, button.style === 'cancel' && s.cancel]} onPress={() => {
        if (closeWebAlert(alert.id)) button.onPress?.();
      }}><Text style={[s.label, button.style === 'cancel' && { color: T.textSoft }, button.style === 'destructive' && { color: '#8B1010' }]}>{button.text || 'Tamam'}</Text></Pressable>)}</View>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({ overlay: { flex: 1, backgroundColor: '#000A', justifyContent: 'center', alignItems: 'center', padding: 22 }, card: { width: '100%', maxWidth: 420, backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 18, padding: 22 }, title: { color: T.text, fontSize: 19, fontWeight: '800' }, message: { color: T.textSoft, fontSize: 15, lineHeight: 23, marginTop: 12 }, actions: { gap: 9, marginTop: 24 }, button: { minHeight: 46, backgroundColor: T.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 12 }, cancel: { backgroundColor: T.surfaceRaised, borderColor: T.border, borderWidth: 1 }, label: { color: '#13100A', fontSize: 15, fontWeight: '700' } });
