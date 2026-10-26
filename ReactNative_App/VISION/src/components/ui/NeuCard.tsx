/**
 * NeuCard — Neumorphic Card Component
 *
 * The fundamental building block for the VISION UI.
 * Provides a soft raised surface with configurable shadow depth.
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { neuOutset, neuDarkOutset, Radius, Spacing } from '@/constants/neumorphic';
import { Colors } from '@/constants/colors';

interface NeuCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Shadow distance (default: 6) */
  distance?: number;
  /** Shadow blur (default: 12) */
  blur?: number;
  /** Use dark neumorphic variant */
  dark?: boolean;
  /** Background color override */
  bg?: string;
  /** Border radius override */
  radius?: number;
  /** No padding */
  noPadding?: boolean;
}

export function NeuCard({
  children,
  style,
  distance = 6,
  blur = 12,
  dark = false,
  bg,
  radius = Radius.xl,
  noPadding = false,
}: NeuCardProps) {
  const neuStyle = dark
    ? neuDarkOutset(distance, blur, bg || Colors.neuDarkSurface)
    : neuOutset(distance, blur, bg || Colors.neuSurface);

  return (
    <View
      style={[
        neuStyle,
        {
          borderRadius: radius,
          padding: noPadding ? 0 : Spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
