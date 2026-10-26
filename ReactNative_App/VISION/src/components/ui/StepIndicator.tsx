/**
 * StepIndicator — 4-Step Biometric Capture Progress Bar
 * 
 * Segmented progress indicator (1. Front, 2. Left, 3. Right, 4. Tilt)
 * matching Stitch Biometric Enrollment design screen.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';

export interface StepItem {
  id: number;
  label: string;
}

const DEFAULT_STEPS: StepItem[] = [
  { id: 1, label: 'Front' },
  { id: 2, label: 'Left' },
  { id: 3, label: 'Right' },
  { id: 4, label: 'Tilt' },
];

interface StepIndicatorProps {
  currentStep: number;
  steps?: StepItem[];
}

export function StepIndicator({ currentStep, steps = DEFAULT_STEPS }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const isCompleted = step.id < currentStep;
        const isActive = step.id === currentStep;

        return (
          <React.Fragment key={step.id}>
            <View style={styles.stepColumn}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.completedCircle,
                  isActive && styles.activeCircle,
                ]}
              >
                <Text
                  style={[
                    styles.circleText,
                    (isCompleted || isActive) && styles.activeCircleText,
                  ]}
                >
                  {isCompleted ? '✓' : step.id}
                </Text>
              </View>
              <Text
                style={[
                  styles.label,
                  isActive && styles.activeLabel,
                  isCompleted && styles.completedLabel,
                ]}
              >
                {step.label}
              </Text>
            </View>

            {index < steps.length - 1 && (
              <View
                style={[
                  styles.line,
                  step.id < currentStep && styles.completedLine,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    width: '100%',
  },
  stepColumn: {
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.navy800,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  activeCircle: {
    backgroundColor: Colors.orange600,
    borderColor: Colors.orange400,
    elevation: 4,
  },
  completedCircle: {
    backgroundColor: Colors.green600,
    borderColor: Colors.green600,
  },
  circleText: {
    ...Typography.caption,
    color: Colors.gray400,
    fontWeight: '700',
  },
  activeCircleText: {
    color: Colors.white,
  },
  label: {
    ...Typography.tiny,
    color: Colors.gray500,
  },
  activeLabel: {
    color: Colors.orange600,
    fontWeight: '800',
  },
  completedLabel: {
    color: Colors.green600,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.navy800,
    marginHorizontal: Spacing.xs,
    marginTop: -16,
  },
  completedLine: {
    backgroundColor: Colors.green600,
  },
});
