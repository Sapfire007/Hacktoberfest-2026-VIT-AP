import React from 'react';
import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { RoleGuard } from '@/components/RoleGuard';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useIsWide } from '@/components/admin/AdminKit';

/**
 * Admin console shell.
 *
 * One set of screens for every device (Design.md §5.7). On a wide screen — a tablet in
 * landscape, or the console opened in a browser with `npx expo start --web` — a sidebar
 * sits beside the page. On a phone the overview doubles as the menu and each page has a
 * back link to it.
 *
 * The role guard here only decides where an admin lands. Every admin endpoint checks the
 * `admin` role claim itself, so a non-admin who reached these screens would see nothing.
 */
export default function AdminLayout() {
  const wide = useIsWide();

  const stack = (
    <Stack screenOptions={{ headerShown: false, animation: wide ? 'none' : 'default' }}>
      <Stack.Screen name="overview" />
      <Stack.Screen name="gate-log" />
      <Stack.Screen name="entries/index" />
      <Stack.Screen name="entries/[id]" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="passes/index" />
      <Stack.Screen name="passes/new" />
      <Stack.Screen name="passes/[id]" />
      <Stack.Screen name="watchlist" />
      <Stack.Screen name="staff" />
      <Stack.Screen name="users" />
      <Stack.Screen name="audit" />
    </Stack>
  );

  return (
    <RoleGuard allow={['admin']}>
      <View style={[styles.container, wide && styles.row]}>
        {wide && <AdminSidebar />}
        <View style={styles.content}>{stack}</View>
      </View>
    </RoleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neuBackground },
  row: { flexDirection: 'row' },
  content: { flex: 1 },
});
