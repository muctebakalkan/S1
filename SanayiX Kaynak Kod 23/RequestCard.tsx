import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOW } from '../lib/constants';
import { ChevronRightIcon, CarIcon, ClockIcon } from './icons';

interface RequestCardProps {
  title: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  damageArea?: string;
  status: string;
  createdAt: string;
  onPress?: () => void;
  compact?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Bekliyor', color: '#D97706', bg: '#FEF3C7' },
  active: { label: 'Aktif', color: '#0060A8', bg: '#DBEAFE' },
  completed: { label: 'Tamamlandı', color: '#059669', bg: '#D1FAE5' },
  cancelled: { label: 'İptal', color: '#DC2626', bg: '#FEE2E2' },
};

export const RequestCard: React.FC<RequestCardProps> = ({
  title,
  vehicleBrand,
  vehicleModel,
  damageArea,
  status,
  createdAt,
  onPress,
  compact = false,
}) => {
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG['pending'];
  const dateStr = new Date(createdAt).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.badgeText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {(vehicleBrand || vehicleModel) && (
          <View style={styles.detail}>
            <CarIcon size={13} color={COLORS.textSecondary} />
            <Text style={styles.detailText}>
              {[vehicleBrand, vehicleModel].filter(Boolean).join(' ')}
            </Text>
          </View>
        )}

        {!compact && damageArea && (
          <Text style={styles.area}>{damageArea}</Text>
        )}

        <View style={styles.footer}>
          <View style={styles.detail}>
            <ClockIcon size={12} color={COLORS.textLight} />
            <Text style={styles.dateText}>{dateStr}</Text>
          </View>
          <ChevronRightIcon size={16} color={COLORS.textLight} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOW.card,
  },
  header: {
    gap: SPACING.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  title: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.text,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  badgeText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  area: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  dateText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textLight,
  },
});
