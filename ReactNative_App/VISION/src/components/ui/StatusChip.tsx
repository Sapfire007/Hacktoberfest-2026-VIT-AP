/**
 * StatusChip — Status Badge Component
 *
 * Pill-shaped badge for request/permit status per Design.md §3.
 * Color-coded: Submitted=gray, Under Review=blue, Approved=green,
 * Rejected=red, Expired=gray-strike.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusColors, type StatusKey } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Radius, Spacing } from '@/constants/neumorphic';
import { getEffectiveStatus } from '@/utils/visitStatus';

interface StatusChipProps {
  status: StatusKey;
  /** Override the label text */
  label?: string;
  /** Small variant */
  small?: boolean;
  /** Visit date to check for expiration */
  visitDate?: string;
  /** Visit end timestamp */
  visitEndAt?: string | null;
}

export function StatusChip({ status, label, small = false, visitDate, visitEndAt }: StatusChipProps) {
  // Determine effective status (may change active → expired if date passed)
  const effectiveStatus = visitDate 
    ? getEffectiveStatus(status, visitDate, visitEndAt)
    : status;
    
  const config = StatusColors[effectiveStatus];
  if (!config) return null;

  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: config.bg },
        small && styles.chipSmall,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.text }]} />
      <Text
        style={[
          small ? Typography.tiny : Typography.statusBadge,
          { color: config.text },
        ]}
      >
        {label || config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  chipSmall: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
