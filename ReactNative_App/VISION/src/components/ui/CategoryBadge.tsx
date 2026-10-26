/**
 * CategoryBadge — Role/Category Badge Component
 *
 * Displays visitor type badges: Parent, Vendor, Guest Lecturer, Alumni, etc.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CategoryColors, type CategoryKey } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Radius, Spacing } from '@/constants/neumorphic';

interface CategoryBadgeProps {
  category: CategoryKey;
  /** Override the label text */
  label?: string;
}

export function CategoryBadge({ category, label }: CategoryBadgeProps) {
  const config = CategoryColors[category];
  if (!config) return null;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[Typography.labelCaps, { color: config.text, fontSize: 10, lineHeight: 14 }]}>
        {label || config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
});
