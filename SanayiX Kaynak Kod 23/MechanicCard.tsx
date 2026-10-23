import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../lib/constants';
import { ChevronRightIcon, MapPinIcon, BriefcaseIcon } from './icons';

interface MechanicCardProps {
  name: string;
  specialty: string;
  address?: string;
  district?: string;
  city?: string;
  isAvailable: boolean;
  onPress?: () => void;
}

export const MechanicCard: React.FC<MechanicCardProps> = ({
  name,
  specialty,
  address,
  district,
  city,
  isAvailable,
  onPress,
}) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          <View style={[styles.badge, isAvailable ? styles.badgeAvailable : styles.badgeBusy]}>
            <Text style={[styles.badgeText, isAvailable ? styles.badgeTextAvailable : styles.badgeTextBusy]}>
              {isAvailable ? 'Müsait' : 'Meşgul'}
            </Text>
          </View>
        </View>

        <View style={styles.detail}>
          <BriefcaseIcon size={13} color={COLORS.textSecondary} />
          <Text style={styles.detailText}>{specialty}</Text>
        </View>

        {(district || city) && (
          <View style={styles.detail}>
            <MapPinIcon size={13} color={COLORS.textSecondary} />
            <Text style={styles.detailText}>
              {[district, city].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}
      </View>

      <ChevronRightIcon size={18} color={COLORS.textLight} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    ...SHADOW.card,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.white,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: SPACING.sm,
  },
  name: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  badgeAvailable: {
    backgroundColor: '#D1FAE5',
  },
  badgeBusy: {
    backgroundColor: '#FEE2E2',
  },
  badgeText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
  },
  badgeTextAvailable: {
    color: '#059669',
  },
  badgeTextBusy: {
    color: '#DC2626',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  detailText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
