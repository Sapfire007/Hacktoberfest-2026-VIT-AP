/**
 * Student Sponsored Visits Tracker Screen
 */

import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { RequestCard } from '@/components/ui/RequestCard';
import { useApp } from '@/context/AppContext';

export default function SponsoredVisitsScreen() {
  const router = useRouter();
  const { requests } = useApp();

  return (
    <View style={styles.container}>
      <NeuHeader title="Sponsored Visits" showLogo={false} />

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <RequestCard
            id={item.id}
            destination={item.destination}
            purpose={item.purpose}
            hostName={item.targetFacultyName}
            dateTime={`${item.date} • ${item.timeWindow}`}
            status={item.status}
            onPress={() => router.push(`/(student)/requests/${item.id}` as never)}
          />
        )}
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
