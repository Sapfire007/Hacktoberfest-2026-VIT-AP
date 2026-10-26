/**
 * NeuButton — Neumorphic Button Component
 *
 * Provides pressed/released states with neumorphic shadow transitions.
 * Supports primary (navy), accent (orange), success, danger, and ghost variants.
 */

import React, { useState } from 'react';
import {
  Pressable,
  Text,
  View,
  ViewStyle,
  TextStyle,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { neuOutset, neuInset, Spacing, Radius } from '@/constants/neumorphic';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';

type ButtonVariant = 'primary' | 'navy' | 'secondary' | 'accent' | 'success' | 'danger' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface NeuButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const variantColors: Record<ButtonVariant, { bg: string; text: string }> = {
  primary: { bg: Colors.navy900, text: Colors.white },
  navy: { bg: Colors.navy900, text: Colors.white },
  secondary: { bg: Colors.gray200, text: Colors.navy900 },
  accent: { bg: Colors.orange600, text: Colors.white },
  success: { bg: Colors.green600, text: Colors.white },
  danger: { bg: Colors.red600, text: Colors.white },
  ghost: { bg: Colors.neuSurface, text: Colors.navy900 },
  outline: { bg: 'transparent', text: Colors.navy900 },
};

const sizeStyles: Record<ButtonSize, { py: number; px: number; textStyle: TextStyle }> = {
  sm: { py: Spacing.sm, px: Spacing.lg, textStyle: Typography.buttonSm },
  md: { py: Spacing.md, px: Spacing['2xl'], textStyle: Typography.button },
  lg: { py: Spacing.lg, px: Spacing['3xl'], textStyle: Typography.button },
};

export function NeuButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  style,
  textStyle,
}: NeuButtonProps) {
  const [pressed, setPressed] = useState(false);
  const colors = variantColors[variant];
  const sizeConfig = sizeStyles[size];

  const isNeu = variant === 'ghost';
  const isOutline = variant === 'outline';

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        isNeu
          ? pressed
            ? neuInset(3, 6, colors.bg)
            : neuOutset(4, 8, colors.bg)
          : { backgroundColor: disabled ? Colors.gray300 : colors.bg },
        {
          borderRadius: Radius.lg,
          paddingVertical: sizeConfig.py,
          paddingHorizontal: sizeConfig.px,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          opacity: disabled ? 0.6 : pressed && !isNeu ? 0.85 : 1,
        },
        isOutline && {
          borderWidth: 2,
          borderColor: disabled ? Colors.gray300 : Colors.navy900,
        },
        fullWidth && { width: '100%' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} size="small" />
      ) : (
        <>
          {icon && <View>{icon}</View>}
          <Text
            style={[
              sizeConfig.textStyle,
              { color: disabled ? Colors.gray500 : colors.text },
              textStyle,
            ]}
          >
            {title}
          </Text>
          {iconRight && <View>{iconRight}</View>}
        </>
      )}
    </Pressable>
  );
}
