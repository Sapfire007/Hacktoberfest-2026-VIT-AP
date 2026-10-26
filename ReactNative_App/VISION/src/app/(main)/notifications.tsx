/**
 * Notifications Feed Screen
 */

import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { NotificationItem } from '@/components/ui/NotificationItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApp } from '@/context/AppContext';

export default function NotificationsScreen() {
  const { notifications, markNotificationRead } = useApp();

  return (
    <View style={styles.container}>
      <NeuHeader title="Notifications" showLogo={false} />

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <NotificationItem
            id={item.id}
            type={item.type}
            title={item.title}
            message={item.message}
            timestamp={item.timestamp}
            read={item.read}
            onPress={() => markNotificationRead(item.id)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No Notifications"
            subtitle="Status updates and security alerts will appear here."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingBottom: Spacing['4xl'],
  },
});
