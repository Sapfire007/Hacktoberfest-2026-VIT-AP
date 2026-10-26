/**
 * ProfileAvatar — Avatar with Verification Badge
 *
 * Displays user photo with optional verified checkmark overlay.
 * Per Design.md §3: "Profile avatar + verification badge —
 * small check overlay once biometric enrollment is complete"
 */

import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { neuOutset, Radius } from '@/constants/neumorphic';
import { Typography } from '@/constants/typography';

interface ProfileAvatarProps {
  /** Image URL */
  uri?: string;
  /** User's name (for initials fallback) */
  name?: string;
  /** Size in pixels */
  size?: number;
  /** Show verified badge */
  verified?: boolean;
}

export function ProfileAvatar({
  uri,
  name,
  size = 48,
  verified = false,
}: ProfileAvatarProps) {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  const badgeSize = Math.max(16, size * 0.35);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.initialsContainer,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: Colors.navy800,
            },
          ]}
        >
          <Text
            style={[
              Typography.button,
              {
                color: Colors.white,
                fontSize: size * 0.35,
              },
            ]}
          >
            {initials}
          </Text>
        </View>
      )}
      {verified && (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              right: -2,
              bottom: -2,
            },
          ]}
        >
          <Text style={{ color: Colors.white, fontSize: badgeSize * 0.6 }}>✓</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    resizeMode: 'cover',
  },
  initialsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    backgroundColor: Colors.green600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
});
