/**
 * NeuInput — Neumorphic Text Input
 *
 * Inset styled input field matching the VISION neumorphic design language.
 */

import React, { useState } from 'react';
import { TextInput, View, Text, TextInputProps, ViewStyle, StyleSheet } from 'react-native';
import { neuInset, Spacing, Radius } from '@/constants/neumorphic';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';

interface NeuInputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function NeuInput({
  label,
  error,
  icon,
  rightIcon,
  containerStyle,
  style,
  ...props
}: NeuInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          neuInset(4, 8),
          styles.inputWrapper,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
      >
        {icon && <View style={styles.icon}>{icon}</View>}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={Colors.gray400}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    ...Typography.caption,
    color: Colors.gray600,
    marginLeft: 4,
  },
  inputWrapper: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 48,
  },
  inputFocused: {
    borderWidth: 2,
    borderColor: Colors.blue500,
  },
  inputError: {
    borderWidth: 2,
    borderColor: Colors.red600,
  },
  input: {
    ...Typography.bodyMd,
    color: Colors.gray900,
    flex: 1,
    padding: 0,
  },
  icon: {
    opacity: 0.6,
  },
  error: {
    ...Typography.caption,
    color: Colors.red600,
    marginLeft: 4,
  },
});
