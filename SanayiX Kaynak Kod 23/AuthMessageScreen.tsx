import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { COLORS, FONTS, SPACING } from '../lib/constants';
import SanayixLogo from './SanayixLogo';
export default function AuthMessageScreen({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SanayixLogo theme="dark" iconSize={24} fontSize={18} />
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>{children}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: SPACING.lg, paddingTop: 64, paddingBottom: 48, gap: 16 },
  title: { color: COLORS.text, fontFamily: FONTS.extrabold, fontSize: 28, marginTop: 20 },
  description: { color: COLORS.textSecondary, fontFamily: FONTS.regular, lineHeight: 22, fontSize: 14 },
});
