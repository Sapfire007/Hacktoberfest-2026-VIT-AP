/**
 * NeuDropdown — Neumorphic Select Dropdown
 * 
 * Provides a tactile neumorphic dropdown selector with bottom modal picker
 * matching the VISION design system.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  ViewStyle,
  TouchableWithoutFeedback,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuInset, neuOutset } from '@/constants/neumorphic';

interface NeuDropdownProps {
  label?: string;
  options: string[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function NeuDropdown({
  label,
  options,
  selectedValue,
  onSelect,
  placeholder = 'Select an option...',
  error,
  containerStyle,
}: NeuDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (option: string) => {
    onSelect(option);
    setIsOpen(false);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Trigger Button */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setIsOpen(true)}
        style={[
          neuInset(4, 8),
          styles.triggerWrapper,
          isOpen && styles.triggerOpen,
          error ? styles.triggerError : null,
        ]}
      >
        <Text
          style={[
            styles.valueText,
            !selectedValue && styles.placeholderText,
          ]}
          numberOfLines={1}
        >
          {selectedValue || placeholder}
        </Text>
        <Text style={styles.chevronIcon}>{isOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Dropdown Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, neuOutset(10, 20, Colors.neuSurface)]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {label ? label.replace('*', '').trim() : 'Select Option'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setIsOpen(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Text style={styles.closeIcon}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.optionsList}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {options.map((option, index) => {
                    const isSelected = option === selectedValue;
                    return (
                      <TouchableOpacity
                        key={index}
                        activeOpacity={0.7}
                        onPress={() => handleSelect(option)}
                        style={[
                          styles.optionItem,
                          isSelected && styles.optionItemSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            isSelected && styles.optionTextSelected,
                          ]}
                        >
                          {option}
                        </Text>
                        {isSelected && (
                          <View style={styles.checkBadge}>
                            <Text style={styles.checkText}>✓</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    fontWeight: '600',
  },
  triggerWrapper: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    backgroundColor: Colors.neuSurface,
  },
  triggerOpen: {
    borderWidth: 2,
    borderColor: Colors.blue500,
  },
  triggerError: {
    borderWidth: 2,
    borderColor: Colors.red600,
  },
  valueText: {
    ...Typography.bodyMd,
    color: Colors.gray900,
    flex: 1,
    fontWeight: '500',
  },
  placeholderText: {
    color: Colors.gray400,
    fontWeight: '400',
  },
  chevronIcon: {
    fontSize: 12,
    color: Colors.gray500,
    marginLeft: Spacing.sm,
  },
  error: {
    ...Typography.caption,
    color: Colors.red600,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
    padding: Spacing.md,
  },
  modalCard: {
    backgroundColor: Colors.neuSurface,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    maxHeight: '65%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontSize: 16,
  },
  closeIcon: {
    fontSize: 16,
    color: Colors.gray500,
    fontWeight: 'bold',
    padding: 4,
  },
  optionsList: {
    paddingVertical: Spacing.xs,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginVertical: 3,
  },
  optionItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  optionText: {
    ...Typography.bodyMd,
    color: Colors.gray800,
    fontSize: 15,
  },
  optionTextSelected: {
    color: Colors.blue500,
    fontWeight: '700',
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.blue500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
