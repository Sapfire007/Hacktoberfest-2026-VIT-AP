/**
 * Neumorphic Date Picker Component
 * 
 * Custom date picker with dropdown selection (no native dependencies)
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
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { Icon } from './Icon';

interface NeuDatePickerProps {
  label?: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function NeuDatePicker({ label, value, onChange, minimumDate }: NeuDatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(value.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(value.getMonth());

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysInMonth = (year: number, month: number) => {
    if (month === 1) { // February
      return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
    }
    return DAYS_IN_MONTH[month];
  };

  const getYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = 0; i < 5; i++) {
      years.push(currentYear + i);
    }
    return years;
  };

  const handleDaySelect = (day: number) => {
    const newDate = new Date(selectedYear, selectedMonth, day);
    if (minimumDate && newDate < minimumDate) {
      return; // Don't allow dates before minimum
    }
    onChange(newDate);
    setShowPicker(false);
  };

  const isDateDisabled = (day: number) => {
    if (!minimumDate) return false;
    const checkDate = new Date(selectedYear, selectedMonth, day);
    return checkDate < minimumDate;
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <Pressable
        onPress={() => setShowPicker(true)}
        style={[styles.button, neuOutset(4, 8, Colors.neuSurface)]}
      >
        <Icon name="calendar" size={20} color={Colors.gray700} />
        <Text style={styles.displayText}>{formatDate(value)}</Text>
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
            {/* Month/Year Selectors */}
            <View style={styles.header}>
              <View style={styles.selectorRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
                  {MONTHS.map((month, index) => (
                    <Pressable
                      key={month}
                      onPress={() => setSelectedMonth(index)}
                      style={[
                        styles.monthButton,
                        selectedMonth === index && styles.monthButtonActive,
                      ]}
                    >
                      <Text style={[
                        styles.monthText,
                        selectedMonth === index && styles.monthTextActive,
                      ]}>
                        {month}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.selectorRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearScroll}>
                  {getYears().map((year) => (
                    <Pressable
                      key={year}
                      onPress={() => setSelectedYear(year)}
                      style={[
                        styles.yearButton,
                        selectedYear === year && styles.yearButtonActive,
                      ]}
                    >
                      <Text style={[
                        styles.yearText,
                        selectedYear === year && styles.yearTextActive,
                      ]}>
                        {year}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendar}>
              <View style={styles.weekHeader}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <Text key={i} style={styles.weekDay}>{day}</Text>
                ))}
              </View>

              <View style={styles.daysGrid}>
                {Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1).map((day) => {
                  const isSelected = 
                    day === value.getDate() &&
                    selectedMonth === value.getMonth() &&
                    selectedYear === value.getFullYear();
                  const isDisabled = isDateDisabled(day);

                  return (
                    <Pressable
                      key={day}
                      onPress={() => !isDisabled && handleDaySelect(day)}
                      style={[
                        styles.dayButton,
                        isSelected && styles.dayButtonActive,
                        isDisabled && styles.dayButtonDisabled,
                      ]}
                      disabled={isDisabled}
                    >
                      <Text style={[
                        styles.dayText,
                        isSelected && styles.dayTextActive,
                        isDisabled && styles.dayTextDisabled,
                      ]}>
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
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
    width: '90%',
    maxWidth: 400,
  },
  header: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  selectorRow: {
    flexDirection: 'row',
  },
  monthScroll: {
    flexGrow: 0,
  },
  yearScroll: {
    flexGrow: 0,
  },
  monthButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.xs,
    borderRadius: Radius.full,
  },
  monthButtonActive: {
    backgroundColor: Colors.navy900,
  },
  monthText: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: '600',
  },
  monthTextActive: {
    color: Colors.white,
  },
  yearButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.xs,
    borderRadius: Radius.full,
  },
  yearButtonActive: {
    backgroundColor: Colors.navy900,
  },
  yearText: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: '600',
  },
  yearTextActive: {
    color: Colors.white,
  },
  calendar: {
    gap: Spacing.sm,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  weekDay: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontWeight: '700',
    width: 40,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  dayButton: {
    width: '13.5%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  dayButtonActive: {
    backgroundColor: Colors.navy900,
  },
  dayButtonDisabled: {
    opacity: 0.3,
  },
  dayText: {
    ...Typography.bodyMd,
    color: Colors.gray900,
    fontWeight: '600',
  },
  dayTextActive: {
    color: Colors.white,
  },
  dayTextDisabled: {
    color: Colors.gray400,
  },
});
