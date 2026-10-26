/**
 * NeuHeader — Header Bar Component
 * 
 * Top bar displaying VISION title, VIT-AP University emblem/logo,
 * and quick notification action matching Stitch design screens.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, neuOutset } from '@/constants/neumorphic';
import { VisionEyeLogo } from './VisionEyeLogo';
import { Icon } from '@/components/ui/Icon';

interface NeuHeaderProps {
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  onNotificationPress?: () => void;
  unreadCount?: number;
  rightAction?: React.ReactNode;
}

export function NeuHeader({
  title = 'VISION',
  subtitle,
  showLogo = true,
  onNotificationPress,
  unreadCount = 0,
  rightAction,
}: NeuHeaderProps) {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.leftRow}>
        <View style={styles.eyeLogoBadge}>
          <VisionEyeLogo size={34} />
        </View>
        <View>
          <Text style={styles.brandTitle}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>

      <View style={styles.rightRow}>
        {showLogo && (
          <Image
            source={require('@/assets/images/vit_ap_logo.png')}
            style={styles.headerLogoImage}
            resizeMode="contain"
          />
        )}

        {rightAction ? (
          rightAction
        ) : onNotificationPress ? (
          <Pressable
            onPress={onNotificationPress}
            style={[styles.iconButton, neuOutset(3, 6, Colors.neuSurface)]}
          >
            <Icon name="notification-bell" size={18} color={Colors.navy900} />
            {unreadCount > 0 && (
              <View style={styles.badgeDot}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.neuBackground,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  eyeLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.navy900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 18,
  },
  brandTitle: {
    ...Typography.headlineMd,
    fontSize: 20,
    lineHeight: 24,
    color: Colors.navy900,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerLogoImage: {
    width: 110,
    height: 36,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.red600,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '800',
  },
});
