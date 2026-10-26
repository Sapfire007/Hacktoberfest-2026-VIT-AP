/**
 * NativeDateTimePicker — browser version.
 *
 * `@react-native-community/datetimepicker` has no web implementation, so in the browser
 * (the admin console) the same props drive the browser's own date and time inputs. Metro
 * picks this file for web builds; the native file is unchanged.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';

interface NativeDateTimePickerProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  mode: 'date' | 'time';
  minimumDate?: Date;
  maximumDate?: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function NativeDateTimePicker({
  label,
  value,
  onChange,
  mode,
  minimumDate,
  maximumDate,
}: NativeDateTimePickerProps) {
  const handle = (raw: string) => {
    if (!raw) return;
    const next = new Date(value);
    if (mode === 'date') {
      const [y, m, d] = raw.split('-').map(Number);
      next.setFullYear(y, m - 1, d);
    } else {
      const [h, min] = raw.split(':').map(Number);
      next.setHours(h, min, 0, 0);
    }
    onChange(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {React.createElement('input', {
        type: mode,
        value: mode === 'date' ? toDateInput(value) : toTimeInput(value),
        min: mode === 'date' && minimumDate ? toDateInput(minimumDate) : undefined,
        max: mode === 'date' && maximumDate ? toDateInput(maximumDate) : undefined,
        onChange: (event: { target: { value: string } }) => handle(event.target.value),
        style: {
          fontSize: 15,
          fontFamily: 'inherit',
          padding: '12px 14px',
          borderRadius: Radius.lg,
          border: `1px solid ${Colors.gray300}`,
          background: '#FFFFFF',
          color: Colors.navy900,
          width: '100%',
          boxSizing: 'border-box',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  label: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    fontWeight: '700',
  },
});
