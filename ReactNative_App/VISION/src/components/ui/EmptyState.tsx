/**
 * EmptyState — Empty State Pattern
 *
 * Per Design.md §3: "icon + one-line explanation + primary action,
 * never a bare blank screen"
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from './NeuButton';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.iconWrapper}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <View style={styles.action}>
          <NeuButton title={actionLabel} onPress={onAction} variant="accent" size="md" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['3xl'],
    gap: Spacing.md,
  },
  iconWrapper: {
    marginBottom: Spacing.sm,
    opacity: 0.5,
  },
  title: {
    ...Typography.headlineSm,
    color: Colors.gray700,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMd,
    color: Colors.gray500,
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    marginTop: Spacing.lg,
  },
});
