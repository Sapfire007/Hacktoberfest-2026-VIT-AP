/**
 * Faculty Profile Screen
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { getMyFacultyProfile } from '@/services/faculty.service';

export default function FacultyProfileScreen() {
  const router = useRouter();
  const { user, logout, fetchUserProfile } = useAuth();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [facultyPhotoURL, setFacultyPhotoURL] = React.useState<string | null>(null);

  // The faculty directory record (via the API) carries the official photo.
  React.useEffect(() => {
    const fetchFacultyPhoto = async () => {
      try {
        setIsRefreshing(true);
        await fetchUserProfile();

        if (!user?.profilePhotoUri) {
          const faculty = await getMyFacultyProfile();
          if (faculty?.photoURL) setFacultyPhotoURL(faculty.photoURL);
        }
      } catch (error) {
        console.warn('Could not load faculty photo:', (error as Error).message);
      } finally {
        setIsRefreshing(false);
      }
    };

    if (user?.employeeId) {
      fetchFacultyPhoto();
    }
  }, [user?.employeeId]);

  const displayPhotoUri = facultyPhotoURL || user?.profilePhotoUri;

  return (
    <View style={styles.container}>
      <NeuHeader title="Faculty Profile" showLogo={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.userCard, neuOutset(6, 12, Colors.neuSurface)]}>
          {isRefreshing ? (
            <View style={styles.avatarLoading}>
              <ActivityIndicator size="small" color={Colors.navy900} />
            </View>
          ) : (
            <ProfileAvatar 
              uri={displayPhotoUri} 
              name={user.name} 
              size={72} 
              verified 
            />
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userDept}>{user.department || 'SCOPE Department'}</Text>
            <Text style={styles.userRole}>{user.designation || 'Professor & Student Mentor'}</Text>
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
  userDept: {
    ...Typography.caption,
    color: Colors.gray700,
    fontWeight: '700',
  },
  userRole: {
    ...Typography.tiny,
    color: Colors.blue500,
  },
  avatarLoading: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
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
