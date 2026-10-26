/**
 * Profile & Settings Screen — User Account Management
 * 
 * Account settings with verified biometric status and role switcher controls.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/ui/Icon';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, role, logout } = useAuth();

  return (
    <View style={styles.container}>
      <NeuHeader title="Profile & Settings" showLogo={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={[styles.userCard, neuOutset(6, 12, Colors.neuSurface)]}>
          <ProfileAvatar
            uri={user.profilePhotoUri}
            name={user.name}
            size={72}
            verified={user.biometricEnrolled}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userPhone}>{user.phone}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>
                  {user.biometricEnrolled ? '✓ Biometric Verified' : '⚠️ Biometric Pending'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/*
          A "switch role" grid used to sit here. It is deliberately gone: it called
          switchRole(), which swapped the authenticated user for a hardcoded mock and let
          anyone hand themselves faculty access from a settings screen. Roles are assigned
          by an admin and read from the server-issued claim.
        */}

        {/* Quick Settings Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT ACTIONS</Text>

          <Pressable
            onPress={() => router.push('/(onboarding)/biometric-capture')}
            style={[styles.actionRow, neuOutset(3, 6, Colors.neuSurface)]}
          >
            <View style={styles.actionIconContainer}>
              <Icon name="face-id" size={24} color={Colors.blue600} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Re-scan Biometric Enrollment</Text>
              <Text style={styles.actionSub}>Update your face template if appearance changes</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>

          {role === 'parent' && (
            <Pressable
              onPress={() => router.push('/(main)/linked-students')}
              style={[styles.actionRow, neuOutset(3, 6, Colors.neuSurface)]}
            >
              <View style={styles.actionIconContainer}>
                <Icon name="student" size={24} color={Colors.navy900} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Linked Student Wards</Text>
                <Text style={styles.actionSub}>Manage your children registered at VIT-AP</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          )}
        </View>

        <NeuButton
          title="Log Out"
          variant="danger"
          size="md"
          fullWidth
          onPress={async () => {
            try {
              await logout();
              router.replace('/(onboarding)/splash');
            } catch (error) {
              console.error('Logout error:', error);
            }
          }}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: Radius['2xl'],
    gap: Spacing.md,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontWeight: '800',
  },
  userPhone: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  userEmail: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  badgeRow: {
    marginTop: 4,
  },
  verifiedBadge: {
    backgroundColor: Colors.green100,
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  verifiedText: {
    ...Typography.tiny,
    color: Colors.green600,
    fontWeight: '700',
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  roleBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  roleBtnText: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.navy900,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  actionIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.navy900,
  },
  actionSub: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  arrow: {
    fontSize: 20,
    color: Colors.gray400,
  },
});
