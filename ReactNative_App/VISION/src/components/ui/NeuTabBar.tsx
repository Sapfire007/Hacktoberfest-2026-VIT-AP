/**
 * NeuTabBar — Custom Neumorphic Bottom Navigation Bar
 * 
 * Floating neumorphic bottom tab bar matching Stitch design screens for mobile roles.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { Icon, IconName } from '@/components/ui/Icon';

export interface TabItem {
  key: string;
  label: string;
  icon: IconName | string;
}

interface NeuTabBarProps {
  tabs: TabItem[];
  activeKey: string;
  onTabPress: (key: string) => void;
}

export function NeuTabBar({ tabs, activeKey, onTabPress }: NeuTabBarProps) {
  return (
    <View style={[styles.container, neuOutset(4, 12, Colors.neuSurface)]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const iconColor = isActive ? Colors.white : Colors.gray600;

        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            style={[styles.tabButton, isActive && styles.activeTabButton]}
          >
            {typeof tab.icon === 'string' && tab.icon.length <= 3 ? (
              // Legacy emoji support
              <Text style={[styles.icon, isActive && styles.activeIcon]}>
                {tab.icon}
              </Text>
            ) : (
              <Icon name={tab.icon as IconName} size={20} color={iconColor} />
            )}
            <Text style={[styles.label, isActive && styles.activeLabel]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius['2xl'],
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.neuSurface,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xl,
    gap: 2,
    minWidth: 64,
  },
  activeTabButton: {
    backgroundColor: Colors.navy900,
  },
  icon: {
    fontSize: 18,
    color: Colors.gray600,
  },
  activeIcon: {
    color: Colors.white,
  },
  label: {
    ...Typography.tiny,
    fontSize: 11,
    color: Colors.gray600,
    fontWeight: '600',
  },
  activeLabel: {
    color: Colors.white,
    fontWeight: '800',
  },
});
