/**
 * AdminSidebar — the console's navigation on wide screens (tablet landscape, laptop
 * browser). On a phone the overview page lists the same sections instead.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_NAV } from '@/components/admin/nav';

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, employeeId, logout } = useAuth();

  const signOut = async () => {
    await logout();
    router.replace('/(onboarding)/staff-login');
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandName}>VISION</Text>
        <Text style={styles.brandSub}>Admin console · VIT-AP</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }}>
        {ADMIN_NAV.map((item) => {
          const active = pathname.split('/').includes(item.match);
          return (
            <Pressable
              key={item.href}
              onPress={() => router.replace(item.href as never)}
              style={[styles.item, active && styles.itemActive]}
            >
              <Text style={styles.icon}>{item.icon}</Text>
              <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.user} numberOfLines={1}>{user?.name || 'Administrator'}</Text>
        <Text style={styles.employee}>{employeeId}</Text>
        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: Colors.navy900,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    gap: Spacing.lg,
  },
  brand: { paddingHorizontal: Spacing.sm, gap: 2 },
  brandName: { fontSize: 22, fontWeight: '900', color: Colors.white, letterSpacing: 3 },
  brandSub: { ...Typography.tiny, color: Colors.orange400 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  itemActive: { backgroundColor: Colors.navy700 },
  icon: { fontSize: 16, width: 22, textAlign: 'center' },
  label: { ...Typography.bodySm, color: '#C9D4E3', fontWeight: '600' },
  labelActive: { color: Colors.white, fontWeight: '800' },
  footer: { borderTopWidth: 1, borderTopColor: Colors.navy700, paddingTop: Spacing.md, paddingHorizontal: Spacing.sm, gap: 2 },
  user: { ...Typography.bodySm, color: Colors.white, fontWeight: '700' },
  employee: { ...Typography.tiny, color: '#9FB0C8' },
  signOut: { marginTop: Spacing.sm },
  signOutText: { ...Typography.caption, color: Colors.orange400, fontWeight: '800' },
});
