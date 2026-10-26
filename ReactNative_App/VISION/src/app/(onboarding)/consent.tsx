/**
 * Consent Screen — Biometric Privacy & Opt-In
 *
 * Separate, explicit consent for face processing (PRD.md FR-REG-06), asked between the
 * identity details and the face capture. It used to be off the onboarding path entirely,
 * with its boxes pre-ticked, while the capture screen told the biometric service that
 * consent had been given. Consent has to be an action the person takes, so the box starts
 * empty, and "Not now" skips face enrolment - which can be done later - rather than
 * blocking the account.
 *
 * The general terms of use are accepted at sign-up; this screen is only about the face.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth, homeRouteForRole } from '@/context/AuthContext';

export default function ConsentScreen() {
  const router = useRouter();
  const { role, pendingRole } = useAuth();
  const [biometricAgreed, setBiometricAgreed] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Face verification consent</Text>
        <Text style={styles.subtitle}>
          Optional, and only with your permission.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.consentCard, neuOutset(4, 8, Colors.neuSurface)]}>
          <Text style={styles.cardHeader}>🧬 Facial biometric processing</Text>
          <Text style={styles.cardText}>
            Next, the app takes a photo of your face. VIT-AP's VISION service turns it into a
            mathematical template, encrypts it and stores it, so that campus security can confirm
            it is you at the gate. The photo itself is not kept.
          </Text>
          <Text style={styles.cardText}>
            You can skip this now and enrol later. You can ask for your face data to be deleted at
            any time.
          </Text>
          <Pressable
            onPress={() => setBiometricAgreed(!biometricAgreed)}
            style={styles.checkboxRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: biometricAgreed }}
          >
            <View style={[styles.checkbox, biometricAgreed && styles.checkboxActive]}>
              {biometricAgreed && <Text style={styles.checkText}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              I consent to my face being processed and stored as an encrypted template for gate
              verification.
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <NeuButton
          title="Agree and continue →"
          variant="accent"
          size="lg"
          fullWidth
          disabled={!biometricAgreed}
          onPress={() => router.replace('/(onboarding)/biometric-capture')}
        />
        <Pressable
          onPress={() => router.replace(homeRouteForRole(role ?? pendingRole) as never)}
          style={styles.skip}
        >
          <Text style={styles.skipText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['3xl'],
    justifyContent: 'space-between',
  },
  header: {
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
  },
  subtitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
  },
  cardContent: {
    gap: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  consentCard: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
  },
  cardHeader: {
    ...Typography.headlineSm,
    fontSize: 16,
    color: Colors.navy900,
    fontWeight: '700',
  },
  cardText: {
    ...Typography.caption,
    color: Colors.gray600,
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.gray400,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neuSurface,
  },
  checkboxActive: {
    backgroundColor: Colors.navy900,
    borderColor: Colors.navy900,
  },
  checkText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  checkboxLabel: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.gray800,
    flex: 1,
  },
  footer: {
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  skip: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
  },
  skipText: {
    ...Typography.bodySm,
    color: Colors.gray600,
  },
});
