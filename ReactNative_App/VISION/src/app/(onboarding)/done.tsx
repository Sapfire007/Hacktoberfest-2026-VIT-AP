/**
 * Registration Done Screen — Confirmation & Main App Handoff
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { useAuth, homeRouteForRole } from '@/context/AuthContext';

export default function DoneScreen() {
  const router = useRouter();
  const { user, pendingRole } = useAuth();

  const handleEnterApp = () => {
    const targetRole = user?.role || pendingRole || 'visitor';
    router.replace(homeRouteForRole(targetRole) as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.centerSection}>
        <View style={[styles.successBadge, neuOutset(6, 12, Colors.neuSurface)]}>
          <Text style={styles.checkIcon}>🎉</Text>
        </View>

        <Text style={styles.title}>Registration Complete!</Text>
        <Text style={styles.subtitle}>
          Your digital identity is now verified and ready for seamless campus entry.
        </Text>

        {/* User Card */}
        <View style={[styles.userCard, neuOutset(4, 8, Colors.neuSurface)]}>
          <ProfileAvatar uri={user?.profilePhotoUri} name={user?.name || 'User'} size={64} verified />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'VISION User'}</Text>
            <Text style={styles.userId}>ID: {user?.id || user?.employeeId || 'Verified'}</Text>
            <Text style={styles.userStatus}>✓ Biometric Enrolled & Verified</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <NeuButton
          title="Go to Home Dashboard →"
          variant="accent"
          size="lg"
          fullWidth
          onPress={handleEnterApp}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing['3xl'],
    justifyContent: 'space-between',
  },
  centerSection: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  successBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  checkIcon: {
    fontSize: 36,
  },
  title: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    width: '100%',
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    ...Typography.headlineSm,
    color: Colors.gray900,
  },
  userId: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  userStatus: {
    ...Typography.caption,
    color: Colors.green600,
    fontWeight: '700',
    marginTop: 4,
  },
  footer: {
    paddingVertical: Spacing.lg,
  },
});
