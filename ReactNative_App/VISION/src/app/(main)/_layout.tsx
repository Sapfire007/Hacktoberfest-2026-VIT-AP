import React from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { NeuTabBar, TabItem } from '@/components/ui/NeuTabBar';
import { RoleGuard } from '@/components/RoleGuard';

const TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'requests', label: 'Requests', icon: 'visit-request' },
  { key: 'history', label: 'History', icon: 'stopwatch' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

export default function MainLayout() {
  const router = useRouter();
  const pathname = usePathname();

  // Determine active tab key based on pathname
  const getActiveTabKey = () => {
    if (pathname.includes('/requests')) return 'requests';
    if (pathname.includes('/history')) return 'history';
    if (pathname.includes('/profile')) return 'profile';
    return 'home';
  };

  const handleTabPress = (key: string) => {
    switch (key) {
      case 'home':
        router.push('/(main)/home');
        break;
      case 'requests':
        router.push('/(main)/requests');
        break;
      case 'history':
        router.push('/(main)/history');
        break;
      case 'profile':
        router.push('/(main)/profile');
        break;
    }
  };

  return (
    <RoleGuard allow={['visitor', 'parent']}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="home" />
            <Stack.Screen name="requests/index" />
            <Stack.Screen name="requests/new" />
            <Stack.Screen name="requests/[id]" />
            <Stack.Screen name="permit/[id]" />
            <Stack.Screen name="passes/[id]" />
            <Stack.Screen name="history" />
            <Stack.Screen name="vehicles/index" />
            <Stack.Screen name="vehicles/add" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="linked-students" />
          </Stack>
        </View>
        <NeuTabBar tabs={TABS} activeKey={getActiveTabKey()} onTabPress={handleTabPress} />
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
