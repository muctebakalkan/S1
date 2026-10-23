import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '../../components/MarketplaceUI';
import { LEGAL_DOCUMENTS, LEGAL_UPDATED_AT } from '../../lib/legalContent';
import { MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
export default function LegalScreen() {
  const { document } = useLocalSearchParams<{ document: string }>();
  const doc = typeof document === 'string' ? LEGAL_DOCUMENTS[document] : null;
  return <View style={s.root}><ScreenHeader title={doc?.title || 'Sayfa bulunamadı'} subtitle="SanayiX" /><ScrollView contentContainerStyle={s.content}>
    {doc ? <><Text style={s.date}>Son güncelleme: {LEGAL_UPDATED_AT}</Text>{doc.sections.map(section => <View key={section.title} style={s.section}><Text accessibilityRole="header" style={s.heading}>{section.title}</Text><Text selectable style={s.body}>{section.body}</Text></View>)}
      <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => router.push('/account/delete')}><Text style={s.buttonText}>Hesap silme bölümüne git</Text></TouchableOpacity></> : <Text style={s.body}>İstediğiniz belge bulunamadı.</Text>}
  </ScrollView></View>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: T.background }, content: { padding: 20, paddingBottom: 50, width: '100%', maxWidth: 740, alignSelf: 'center' }, notice: { color: '#FFC170', backgroundColor: '#2A1D0D', padding: 15, borderRadius: 12, fontSize: 14, lineHeight: 22 }, date: { color: T.textMuted, fontSize: 12, marginTop: 14 }, section: { marginTop: 26 }, heading: { color: T.text, fontWeight: '800', fontSize: 18, marginBottom: 9 }, body: { color: T.textSoft, fontSize: 15, lineHeight: 25 }, button: { marginTop: 30, padding: 16, borderRadius: 12, backgroundColor: T.primary, alignItems: 'center' }, buttonText: { color: '#16100A', fontWeight: '800' } });
