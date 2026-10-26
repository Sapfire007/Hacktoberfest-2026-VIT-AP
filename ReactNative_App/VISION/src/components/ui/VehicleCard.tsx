/**
 * VehicleCard — Vehicle Display & Management Card Component
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { NeuCard } from './NeuCard';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { Icon, IconName } from '@/components/ui/Icon';

interface VehicleCardProps {
  id: string;
  plateNumber: string;
  vehicleType: '2-wheeler' | '4-wheeler' | 'other';
  model: string;
  color: string;
  isDefault?: boolean;
  onSetDefault?: () => void;
  onDelete?: () => void;
}

const vehicleTypeIcons: Record<string, IconName> = {
  '2-wheeler': 'motorbike',
  '4-wheeler': 'car',
  'other': 'truck',
};

const vehicleTypeColors: Record<string, string> = {
  '2-wheeler': Colors.blue600,
  '4-wheeler': Colors.navy900,
  'other': Colors.orange600,
};

export function VehicleCard({
  id,
  plateNumber,
  vehicleType,
  model,
  color,
  isDefault = false,
  onSetDefault,
  onDelete,
}: VehicleCardProps) {
  const iconName = vehicleTypeIcons[vehicleType];
  const iconColor = vehicleTypeColors[vehicleType];

  return (
    <NeuCard distance={4} blur={8} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.leftInfo}>
          <View style={styles.iconCircle}>
            <Icon name={iconName} size={24} color={iconColor} />
          </View>
          <View>
            <Text style={styles.plateNumber}>{plateNumber}</Text>
            <Text style={styles.modelColor}>{color} • {model}</Text>
          </View>
        </View>

        {isDefault ? (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultText}>DEFAULT</Text>
          </View>
        ) : onSetDefault ? (
          <Pressable onPress={onSetDefault} style={styles.setDefaultBtn}>
            <Text style={styles.setDefaultText}>Set Default</Text>
          </Pressable>
        ) : null}
      </View>

      {onDelete && (
        <View style={styles.footer}>
          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Remove Vehicle</Text>
          </Pressable>
        </View>
      )}
    </NeuCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateNumber: {
    ...Typography.tabularNumeric,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.gray900,
  },
  modelColor: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  defaultBadge: {
    backgroundColor: Colors.blue100,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  defaultText: {
    ...Typography.tiny,
    color: Colors.blue500,
    fontWeight: '700',
  },
  setDefaultBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  setDefaultText: {
    ...Typography.caption,
    color: Colors.gray600,
    textDecorationLine: 'underline',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    paddingTop: Spacing.xs,
    alignItems: 'flex-end',
  },
  deleteBtn: {
    paddingVertical: 2,
  },
  deleteText: {
    ...Typography.tiny,
    color: Colors.red600,
    fontWeight: '600',
  },
});
