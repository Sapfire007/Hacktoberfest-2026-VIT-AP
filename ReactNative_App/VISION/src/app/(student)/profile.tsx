/**
 * Student Profile Screen
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';

export default function StudentProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <NeuHeader title="Student Profile" showLogo={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.userCard, neuOutset(6, 12, Colors.neuSurface)]}>
          <ProfileAvatar uri={user.profilePhotoUri} name={user.name} size={72} />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.regNo}>Reg No: 24BCE7033</Text>
            <Text style={styles.program}>B.Tech CSE (Core) • 1st Year</Text>
            <Text style={styles.mentorText}>Assigned Mentor: Dr. Anil Verma</Text>
          </View>
        </View>

        {/*
          The "switch to visitor app" shortcut is gone. It called switchRole(), which
          replaced the authenticated user with a mock — so it was not a view change, it
          was a way to hold a different identity. Sign out and sign back in instead.
        */}

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
  regNo: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.gray700,
  },
  program: {
    ...Typography.tiny,
    color: Colors.gray600,
  },
  mentorText: {
    ...Typography.tiny,
    color: Colors.blue500,
    fontWeight: '600',
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
});
