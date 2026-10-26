/**
 * AlertBanner — Sticky System Status Banner Component
 * 
 * Used for offline mode warnings, sync staleness, security alerts per Design.md §3 & §7.4.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { Icon, IconName } from '@/components/ui/Icon';

type AlertType = 'info' | 'warning' | 'error' | 'success' | 'offline';

interface AlertBannerProps {
  type?: AlertType;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

const typeConfigs: Record<AlertType, { bg: string; text: string; icon: IconName }> = {
  info: { bg: Colors.blue100, text: Colors.blue500, icon: 'info-square-rounded' },
  warning: { bg: Colors.orange100, text: Colors.orange600, icon: 'warning' },
  error: { bg: Colors.red100, text: Colors.red600, icon: 'alert' },
  success: { bg: Colors.green100, text: Colors.green600, icon: 'success' },
  offline: { bg: Colors.navy900, text: Colors.white, icon: 'lightning' },
};

export function AlertBanner({
  type = 'warning',
  message,
  actionLabel,
  onAction,
  onDismiss,
}: AlertBannerProps) {
  const config = typeConfigs[type];

  return (
    <View style={[styles.banner, { backgroundColor: config.bg }]}>
      <View style={styles.content}>
        <Icon name={config.icon} size={16} color={config.text} />
        <Text style={[styles.message, { color: config.text }]}>{message}</Text>
      </View>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={styles.actionBtn}>
          <Text style={[styles.actionText, { color: config.text }]}>{actionLabel}</Text>
        </Pressable>
      )}
      {onDismiss && (
        <Pressable onPress={onDismiss} style={styles.dismissBtn}>
          <Text style={[styles.dismissText, { color: config.text }]}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  message: {
    ...Typography.caption,
    fontWeight: '600',
    flex: 1,
  },
  actionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  actionText: {
    ...Typography.tiny,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  dismissBtn: {
    padding: Spacing.xs,
  },
  dismissText: {
    ...Typography.caption,
    fontWeight: '700',
  },
});
