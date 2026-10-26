/**
 * Neumorphic Time Picker Component
 * 
 * Custom time picker with scroll selectors (no native dependencies)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { Icon } from './Icon';

interface NeuTimePickerProps {
  label?: string;
  value: Date;
  onChange: (date: Date) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0-59
const PERIODS = ['AM', 'PM'];

export function NeuTimePicker({ label, value, onChange }: NeuTimePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  
  const get12Hour = (date: Date) => {
    const hours = date.getHours();
    return hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  };

  const getPeriod = (date: Date) => {
    return date.getHours() >= 12 ? 'PM' : 'AM';
  };

  const [selectedHour, setSelectedHour] = useState(get12Hour(value));
  const [selectedMinute, setSelectedMinute] = useState(value.getMinutes());
  const [selectedPeriod, setSelectedPeriod] = useState(getPeriod(value));

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleDone = () => {
    const newDate = new Date(value);
    let hours = selectedHour;
    if (selectedPeriod === 'PM' && hours !== 12) {
      hours += 12;
    } else if (selectedPeriod === 'AM' && hours === 12) {
      hours = 0;
    }
    newDate.setHours(hours, selectedMinute, 0, 0);
    onChange(newDate);
    setShowPicker(false);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <Pressable
        onPress={() => setShowPicker(true)}
        style={[styles.button, neuOutset(4, 8, Colors.neuSurface)]}
      >
        <Icon name="clock" size={20} color={Colors.gray700} />
        <Text style={styles.displayText}>{formatTime(value)}</Text>
        <Text style={styles.arrow}>▼</Text>
      </Pressable>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Select Time</Text>

            <View style={styles.pickerRow}>
              {/* Hours */}
              <View style={styles.pickerColumn}>
                <Text style={styles.columnLabel}>Hour</Text>
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                  {HOURS.map((hour) => (
                    <Pressable
                      key={hour}
                      onPress={() => setSelectedHour(hour)}
                      style={[
                        styles.timeItem,
                        selectedHour === hour && styles.timeItemActive,
                      ]}
                    >
                      <Text style={[
                        styles.timeText,
                        selectedHour === hour && styles.timeTextActive,
                      ]}>
                        {hour}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <Text style={styles.separator}>:</Text>

              {/* Minutes */}
              <View style={styles.pickerColumn}>
                <Text style={styles.columnLabel}>Min</Text>
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                  {MINUTES.map((minute) => (
                    <Pressable
                      key={minute}
                      onPress={() => setSelectedMinute(minute)}
                      style={[
                        styles.timeItem,
                        selectedMinute === minute && styles.timeItemActive,
                      ]}
                    >
                      <Text style={[
                        styles.timeText,
                        selectedMinute === minute && styles.timeTextActive,
                      ]}>
                        {minute.toString().padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* AM/PM */}
              <View style={styles.pickerColumn}>
                <Text style={styles.columnLabel}> </Text>
                <View style={styles.periodContainer}>
                  {PERIODS.map((period) => (
                    <Pressable
                      key={period}
                      onPress={() => setSelectedPeriod(period)}
                      style={[
                        styles.periodItem,
                        selectedPeriod === period && styles.periodItemActive,
                      ]}
                    >
                      <Text style={[
                        styles.periodText,
                        selectedPeriod === period && styles.periodTextActive,
                      ]}>
                        {period}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Pressable onPress={handleDone} style={styles.doneButton}>
              <Text style={styles.doneButtonText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
  },
  displayText: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '600',
    flex: 1,
  },
  arrow: {
    ...Typography.tiny,
    color: Colors.gray600,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.neuSurface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    width: '85%',
    maxWidth: 350,
  },
  title: {
    ...Typography.h3,
    color: Colors.navy900,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  pickerColumn: {
    alignItems: 'center',
  },
  columnLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    marginBottom: Spacing.xs,
    fontWeight: '700',
  },
  scrollView: {
    maxHeight: 200,
    width: 70,
  },
  timeItem: {
    padding: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginBottom: 4,
  },
  timeItemActive: {
    backgroundColor: Colors.navy900,
  },
  timeText: {
    ...Typography.bodyLg,
    color: Colors.gray900,
    fontWeight: '600',
  },
  timeTextActive: {
    color: Colors.white,
  },
  separator: {
    ...Typography.h2,
    color: Colors.gray400,
    marginTop: 20,
  },
  periodContainer: {
    gap: Spacing.xs,
    width: 70,
  },
  periodItem: {
    padding: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  periodItemActive: {
    backgroundColor: Colors.navy900,
  },
  periodText: {
    ...Typography.bodyMd,
    color: Colors.gray900,
    fontWeight: '600',
  },
  periodTextActive: {
    color: Colors.white,
  },
  doneButton: {
    backgroundColor: Colors.navy900,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  doneButtonText: {
    ...Typography.bodyMd,
    color: Colors.white,
    fontWeight: '700',
  },
});
