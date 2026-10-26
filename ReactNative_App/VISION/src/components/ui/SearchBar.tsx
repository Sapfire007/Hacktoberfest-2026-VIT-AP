/**
 * SearchBar — Inset Search Input Component
 */

import React from 'react';
import { View, TextInput, StyleSheet, Pressable, Text } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuInset } from '@/constants/neumorphic';
import { Icon } from '@/components/ui/Icon';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search requests...',
  onClear,
}: SearchBarProps) {
  return (
    <View style={[styles.container, neuInset(4, 8, Colors.neuSurface)]}>
      <Icon name="search" size={18} color={Colors.gray500} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray400}
      />
      {value.length > 0 && (
        <Pressable onPress={onClear || (() => onChangeText(''))} style={styles.clearBtn}>
          <Text style={styles.clearIcon}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    height: 48,
    borderRadius: Radius.xl,
    gap: Spacing.sm,
  },
  input: {
    ...Typography.bodyMd,
    flex: 1,
    color: Colors.gray900,
    padding: 0,
  },
  clearBtn: {
    padding: Spacing.xs,
  },
  clearIcon: {
    fontSize: 12,
    color: Colors.gray500,
    fontWeight: '700',
  },
});
