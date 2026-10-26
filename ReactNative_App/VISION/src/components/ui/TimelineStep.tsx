/**
 * TimelineStep — Vertical Request Timeline Step Component
 * 
 * Displays vertical request status lifecycle step (Submitted -> Under Review -> Approved/Rejected)
 * per Design.md §5.2.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';

export type TimelineState = 'completed' | 'active' | 'pending' | 'rejected';
export type RemarksType = 'approved' | 'rejected' | 'cancelled';

interface TimelineStepProps {
  title: string;
  timestamp?: string;
  description?: string;
  state: TimelineState;
  isLast?: boolean;
  remarks?: string;
  remarksType?: RemarksType; // Type of remarks for color coding
}

const stateColors: Record<TimelineState, string> = {
  completed: Colors.green600,
  active: Colors.blue500,
  pending: Colors.gray400,
  rejected: Colors.red600,
};

export function TimelineStep({
  title,
  timestamp,
  description,
  state,
  isLast = false,
  remarks,
  remarksType,
}: TimelineStepProps) {
  const color = stateColors[state];

  // Determine remarks box colors based on type
  const getRemarksStyles = () => {
    if (!remarksType) {
      // Default (red for rejected)
      return {
        backgroundColor: Colors.red100,
        borderColor: Colors.red600,
        labelColor: Colors.red600,
      };
    }

    switch (remarksType) {
      case 'approved':
        return {
          backgroundColor: Colors.green100,
          borderColor: Colors.green600,
          labelColor: Colors.green600,
        };
      case 'rejected':
        return {
          backgroundColor: Colors.red100,
          borderColor: Colors.red600,
          labelColor: Colors.red600,
        };
      case 'cancelled':
        return {
          backgroundColor: Colors.gray100,
          borderColor: Colors.gray500,
          labelColor: Colors.gray600,
        };
      default:
        return {
          backgroundColor: Colors.gray100,
          borderColor: Colors.gray500,
          labelColor: Colors.gray600,
        };
    }
  };

  const remarksStyles = getRemarksStyles();

  return (
    <View style={styles.container}>
      <View style={styles.leftCol}>
        <View style={[styles.nodeCircle, { borderColor: color, backgroundColor: state === 'pending' ? Colors.neuSurface : color }]}>
          <Text style={styles.nodeIcon}>
            {state === 'completed' ? '✓' : state === 'rejected' ? '✕' : state === 'active' ? '●' : ''}
          </Text>
        </View>
        {!isLast && <View style={[styles.line, { backgroundColor: state === 'completed' ? Colors.green600 : Colors.gray300 }]} />}
      </View>

      <View style={styles.rightCol}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, state === 'active' && styles.activeTitle]}>{title}</Text>
          {timestamp && <Text style={styles.timestamp}>{timestamp}</Text>}
        </View>
        {description && <Text style={styles.description}>{description}</Text>}
        {remarks && (
          <View style={[
            styles.remarksBox,
            {
              backgroundColor: remarksStyles.backgroundColor,
              borderLeftColor: remarksStyles.borderColor,
            }
          ]}>
            <Text style={[styles.remarksLabel, { color: remarksStyles.labelColor }]}>
              Faculty Remarks:
            </Text>
            <Text style={styles.remarksText}>"{remarks}"</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.md,
    minHeight: 64,
  },
  leftCol: {
    alignItems: 'center',
    width: 24,
  },
  nodeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  nodeIcon: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  rightCol: {
    flex: 1,
    paddingBottom: Spacing.lg,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.gray800,
  },
  activeTitle: {
    color: Colors.blue500,
  },
  timestamp: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  description: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  remarksBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
    borderLeftWidth: 3,
  },
  remarksLabel: {
    ...Typography.tiny,
    fontWeight: '800',
  },
  remarksText: {
    ...Typography.caption,
    color: Colors.gray800,
    fontStyle: 'italic',
  },
});
