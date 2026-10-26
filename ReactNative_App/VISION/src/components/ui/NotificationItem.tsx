/**
 * NotificationItem — Notification Feed Entry Component
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { Icon, IconName } from '@/components/ui/Icon';

export type NotificationType = 'approval' | 'rejection' | 'entry' | 'exit' | 'alert' | 'info';

interface NotificationItemProps {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read?: boolean;
  onPress?: () => void;
}

const typeIcons: Record<NotificationType, IconName> = {
  approval: 'success',
  rejection: 'error-or-rejected',
  entry: 'entrance',
  exit: 'exit',
  alert: 'alert',
  info: 'info-square-rounded',
};

const typeColors: Record<NotificationType, string> = {
  approval: Colors.green600,
  rejection: Colors.red600,
  entry: Colors.blue600,
  exit: Colors.orange600,
  alert: Colors.red600,
  info: Colors.blue600,
};

export function NotificationItem({
  type,
  title,
  message,
  timestamp,
  read = false,
  onPress,
}: NotificationItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        !read
          ? neuOutset(4, 8, '#F0F4F8')
          : neuOutset(2, 4, Colors.neuSurface),
      ]}
    >
      <View style={styles.iconCircle}>
        <Icon name={typeIcons[type]} size={18} color={typeColors[type]} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, !read && styles.unreadTitle]}>{title}</Text>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
      </View>

      {!read && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
    position: 'relative',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...Typography.bodyMd,
    fontWeight: '600',
    color: Colors.gray800,
  },
  unreadTitle: {
    color: Colors.navy900,
    fontWeight: '800',
  },
  timestamp: {
    ...Typography.tiny,
    color: Colors.gray400,
  },
  message: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.blue500,
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.md,
  },
});
