/**
 * Faculty Mentor Advisees Screen
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { Image } from 'expo-image';

export default function FacultyAdviseesScreen() {
  return (
    <View style={styles.container}>
      <NeuHeader title="My Advisees" showLogo={false} />
      
      <View style={styles.content}>
        {/* Under Construction SVG */}
        <View style={styles.imageContainer}>
          <Image
            source={require('../../../assets/images/undraw_data-input_ot3j.svg')}
            style={styles.illustration}
            contentFit="contain"
            cachePolicy="none"
          />
        </View>
        
        <Text style={styles.title}>Feature Under Development</Text>
        <Text style={styles.subtitle}>
          The Advisees management module is currently being built. Soon you'll be able to view and manage your mentee students here.
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>🚧 Coming Soon</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['4xl'],
    gap: Spacing.xl,
  },
  imageContainer: {
    width: 280,
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
  title: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  subtitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  badge: {
    backgroundColor: Colors.orange100,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    marginTop: Spacing.sm,
  },
  badgeText: {
    ...Typography.bodyMd,
    color: Colors.orange600,
    fontWeight: '700',
  },
});
