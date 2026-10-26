/**
 * Student Sponsor Home Screen
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { NeuButton } from '@/components/ui/NeuButton';
import { RequestCard } from '@/components/ui/RequestCard';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';

export default function StudentHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { requests } = useApp();

  return (
    <View style={styles.container}>
      <NeuHeader title="VISION Student" showLogo />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeBox}>
          <Text style={styles.title}>Hello, {user.name}</Text>
          <Text style={styles.subTitle}>Sponsor a campus visit for your visiting parents or guardians.</Text>

          <NeuButton
            title="+ Sponsor Parent Visit"
            variant="accent"
            size="lg"
            fullWidth
            onPress={() => router.push('/(student)/sponsor')}
            style={{ marginTop: Spacing.md }}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visits You Sponsored</Text>
          {requests.slice(0, 2).map((req) => (
            <RequestCard
              key={req.id}
              id={req.id}
              destination={req.destination}
              purpose={req.purpose}
              hostName={req.targetFacultyName}
              dateTime={`${req.date} • ${req.timeWindow}`}
              status={req.status}
              onPress={() => router.push(`/(student)/sponsored-visits`)}
            />
          ))}
        </View>
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
    paddingVertical: Spacing.md,
    gap: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  welcomeBox: {
    gap: Spacing.xs,
  },
  title: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
  },
  subTitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontWeight: '800',
  },
});
