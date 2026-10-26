import React from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { NeuTabBar, TabItem } from '@/components/ui/NeuTabBar';
import { RoleGuard } from '@/components/RoleGuard';

const STUDENT_TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'sponsor', label: 'Sponsor', icon: 'family' },
  { key: 'sponsored-visits', label: 'Visits', icon: 'visit-request' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

export default function StudentLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const getActiveTabKey = () => {
    // '/sponsored-visits' contains '/sponsor', so it is checked first. A visit's detail and
    // permit belong to the Visits tab.
    if (
      pathname.includes('/sponsored-visits') ||
      pathname.includes('/requests') ||
      pathname.includes('/permit')
    ) {
      return 'sponsored-visits';
    }
    if (pathname.includes('/sponsor')) return 'sponsor';
    if (pathname.includes('/profile')) return 'profile';
    return 'home';
  };

  const handleTabPress = (key: string) => {
    switch (key) {
      case 'home':
        router.push('/(student)/home');
        break;
      case 'sponsor':
        router.push('/(student)/sponsor');
        break;
      case 'sponsored-visits':
        router.push('/(student)/sponsored-visits');
        break;
      case 'profile':
        router.push('/(student)/profile');
        break;
    }
  };

  return (
    <RoleGuard allow={['student']}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="home" />
            <Stack.Screen name="sponsor" />
            <Stack.Screen name="sponsored-visits" />
            <Stack.Screen name="requests/[id]" />
            <Stack.Screen name="permit/[id]" />
            <Stack.Screen name="profile" />
          </Stack>
        </View>
        <NeuTabBar tabs={STUDENT_TABS} activeKey={getActiveTabKey()} onTabPress={handleTabPress} />
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
