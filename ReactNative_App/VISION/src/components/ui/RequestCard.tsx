/**
 * RequestCard — Visit Request Item Component
 * 
 * Renders individual request entry with icon, destination, host, timestamp,
 * status chip and context actions ("View Permit", "Edit Request", "View Reason")
 * matching Stitch Visitor Home design screen.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { NeuCard } from './NeuCard';
import { StatusChip } from './StatusChip';
import { Colors, type StatusKey } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { Image } from 'expo-image';

interface RequestCardProps {
  id: string;
  destination: string;
  purpose: string;
  hostName?: string;
  hostPhotoURL?: string; // Faculty profile photo
  dateTime: string;
  visitDate?: string; // For expiration checking
  visitEndAt?: string | null;
  status: StatusKey;
  icon?: string;
  onPress?: () => void;
  onActionPress?: () => void;
}

export function RequestCard({
  id,
  destination,
  purpose,
  hostName,
  hostPhotoURL,
  dateTime,
  visitDate,
  visitEndAt,
  status,
  icon = '🏢',
  onPress,
  onActionPress,
}: RequestCardProps) {
  const getActionLabel = () => {
    switch (status) {
      case 'approved':
      case 'permit_active':
        return 'View Permit';
      case 'rejected':
        return 'View Reason';
      case 'submitted':
      case 'under_review':
      case 'pending':
        return 'Edit Request';
      default:
        return 'Details';
    }
  };

  // Get initials for fallback
  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <Pressable onPress={onPress}>
      <NeuCard distance={4} blur={8} style={styles.card}>
        <View style={styles.topRow}>
          {/* Faculty Photo Circle */}
          <View style={styles.photoCircle}>
            {hostPhotoURL ? (
              <Image
                source={{ uri: hostPhotoURL }}
                style={styles.photo}
                cachePolicy="memory-disk"
                contentFit="cover"
              />
            ) : (
              <View style={styles.initialsCircle}>
                <Text style={styles.initialsText}>{getInitials(hostName)}</Text>
              </View>
            )}
          </View>
          
          <View style={styles.mainInfo}>
            <Text style={styles.destination}>{destination}</Text>
            <Text style={styles.purpose}>{purpose}</Text>
            {hostName && <Text style={styles.host}>Host: {hostName}</Text>}
            <Text style={styles.dateTime}>{dateTime}</Text>
          </View>
        </View>

        <View style={styles.bottomRow}>
          <StatusChip 
            status={status} 
            visitDate={visitDate}
            visitEndAt={visitEndAt}
          />
          {onActionPress && (
            <Pressable onPress={onActionPress} style={styles.actionBtn}>
              <Text style={styles.actionText}>{getActionLabel()}</Text>
            </Pressable>
          )}
        </View>
      </NeuCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  photoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: Colors.gray100,
  },
  photo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  initialsCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.navy800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    ...Typography.button,
    fontSize: 16,
    color: Colors.white,
    fontWeight: '700',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  mainInfo: {
    flex: 1,
    gap: 2,
  },
  destination: {
    ...Typography.headlineSm,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.gray900,
  },
  purpose: {
    ...Typography.bodyMd,
    fontSize: 14,
    color: Colors.gray600,
  },
  host: {
    ...Typography.caption,
    color: Colors.blue500,
    fontWeight: '600',
  },
  dateTime: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
  },
  actionBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  actionText: {
    ...Typography.buttonSm,
    fontSize: 13,
    color: Colors.navy900,
    fontWeight: '700',
  },
});
