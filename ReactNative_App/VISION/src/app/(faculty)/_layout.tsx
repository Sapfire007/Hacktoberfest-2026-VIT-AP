import React from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { NeuTabBar, TabItem } from '@/components/ui/NeuTabBar';
import { RoleGuard } from '@/components/RoleGuard';

const FACULTY_TABS: TabItem[] = [
  { key: 'inbox', label: 'Inbox', icon: 'inbox' },
  { key: 'history', label: 'History', icon: 'stopwatch' },
  { key: 'advisees', label: 'Advisees', icon: 'advisees' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

export default function FacultyLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const getActiveTabKey = () => {
    if (pathname.includes('/history')) return 'history';
    if (pathname.includes('/advisees')) return 'advisees';
    if (pathname.includes('/profile')) return 'profile';
    return 'inbox';
  };

  const handleTabPress = (key: string) => {
    switch (key) {
      case 'inbox':
        router.push('/(faculty)/inbox');
        break;
      case 'history':
        router.push('/(faculty)/history');
        break;
      case 'advisees':
        router.push('/(faculty)/advisees');
        break;
      case 'profile':
        router.push('/(faculty)/profile');
        break;
    }
  };

  return (
    <RoleGuard allow={['faculty']}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="inbox" />
            <Stack.Screen name="request-detail/[id]" />
            <Stack.Screen name="history" />
            <Stack.Screen name="advisees" />
            <Stack.Screen name="profile" />
          </Stack>
        </View>
        <NeuTabBar tabs={FACULTY_TABS} activeKey={getActiveTabKey()} onTabPress={handleTabPress} />
      </View>
    </RoleGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  content: {
    flex: 1,
  },
});
