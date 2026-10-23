import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../lib/constants';
import { CarIcon } from './icons';

interface VehicleCardProps {
  brand: string;
  model: string;
  year: string;
  plate?: string;
  compact?: boolean;
}

export const VehicleCard: React.FC<VehicleCardProps> = ({
  brand,
  model,
  year,
  plate,
  compact = false,
}) => {
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <View style={styles.iconContainer}>
        <CarIcon size={compact ? 20 : 28} color={COLORS.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.brandModel}>
          {brand} {model}
        </Text>
        <Text style={styles.year}>{year}{plate ? ` · ${plate}` : ''}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOW.card,
  },
  compact: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  info: {
    flex: 1,
  },
  brandModel: {
    fontFamily: FONTS.semibold,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 2,
  },
  year: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});
