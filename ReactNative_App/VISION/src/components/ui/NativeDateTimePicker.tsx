/**
 * Native Date Time Picker Component
 * 
 * Wrapper around @react-native-community/datetimepicker for consistent styling
 * Now works with native builds (ADB, production builds)
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { Icon } from './Icon';

interface NativeDateTimePickerProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  mode: 'date' | 'time';
  minimumDate?: Date;
  maximumDate?: Date;
}

export function NativeDateTimePicker({
  label,
  value,
  onChange,
  mode,
  minimumDate,
  maximumDate,
}: NativeDateTimePickerProps) {
  const [show, setShow] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    // On Android, picker closes automatically
    if (Platform.OS === 'android') {
      setShow(false);
    }

    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate);
    }
  };

  const formatDisplay = () => {
    if (mode === 'date') {
      return value.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } else {
      return value.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      
      <Pressable
        onPress={() => setShow(true)}
        style={[styles.button, neuOutset(3, 6, Colors.neuSurface)]}
      >
        <Icon name={mode === 'date' ? 'calendar' : 'clock'} size={20} color={Colors.gray700} />
        <Text style={styles.valueText}>{formatDisplay()}</Text>
      </Pressable>

      {show && (
        <DateTimePicker
          value={value}
          mode={mode}
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          // iOS-specific: show inline picker
          {...(Platform.OS === 'ios' && {
            themeVariant: 'light',
            textColor: Colors.navy900,
          })}
        />
      )}

      {/* iOS: Add Done button since picker is inline */}
      {show && Platform.OS === 'ios' && (
        <Pressable
          onPress={() => setShow(false)}
          style={styles.doneButton}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    fontWeight: '700',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
  },
  valueText: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '600',
    flex: 1,
  },
  doneButton: {
    alignSelf: 'flex-end',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.navy900,
    borderRadius: Radius.md,
  },
  doneText: {
    ...Typography.buttonSm,
    color: Colors.white,
    fontWeight: '700',
  },
});
