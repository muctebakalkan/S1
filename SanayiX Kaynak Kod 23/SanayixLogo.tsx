import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../lib/constants';

interface LogoProps {
  theme?: 'dark' | 'light';
  iconSize?: number;
  fontSize?: number;
  iconOnly?: boolean;
}

/** Preserve the supplied artwork and its margins inside a circular black badge. */
export function BrandIcon({ size = 48 }: { size?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="SanayiX logosu"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#000000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Image source={require('../assets/images/brand-logo.png')} accessible={false}
        resizeMode="contain" style={{ width: '90%', height: '90%' }} />
    </View>
  );
}

export default function SanayixLogo({ theme = 'dark', iconSize = 36, fontSize = 20, iconOnly = false }: LogoProps) {
  const color = theme === 'dark' ? COLORS.primary : '#FFFFFF';
  return (
    <View style={styles.row}>
      <BrandIcon size={Math.max(36, iconSize)} />
      {!iconOnly && <Text style={[styles.text, { fontSize, color }]}>Sanayi<Text style={styles.x}>X</Text></Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontFamily: FONTS.bold, letterSpacing: -0.3 },
  x: { fontFamily: FONTS.extrabold },
});
