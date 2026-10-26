/**
 * Verify Email
 *
 * Onboarding continues from here whether or not the address is verified yet — blocking
 * the whole flow on an email round-trip is where people abandon. What verification gates
 * is submitting a visit request (PRD.md FR-REG-01a), which is where it actually matters.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';

/** Seconds to wait before "Resend" becomes tappable again. */
const RESEND_COOLDOWN = 60;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, isEmailVerified, resendVerificationEmail, refreshEmailVerification } = useAuth();

  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCooldown((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  /**
   * Re-check when the app returns to the foreground. People leave to open their mail
   * client and come back — asking them to press a button at that moment is friction for
   * something the app can notice by itself.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshEmailVerification();
    });

    return () => subscription.remove();
  }, [refreshEmailVerification]);

  const handleResend = async () => {
    setError(null);
    try {
      await resendVerificationEmail();
      setNotice('Sent. Check your inbox, and your spam folder.');
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the email');
    }
  };

  const handleCheck = async () => {
    setError(null);
    setChecking(true);
    const verified = await refreshEmailVerification();
    setChecking(false);

    if (!verified) {
      setNotice('Not verified yet. Open the link in the email, then check again.');
    }
  };

  const goOn = () => router.replace('/(onboarding)/identity-details');

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>{isEmailVerified ? '✅' : '📧'}</Text>

        <Text style={styles.title}>
          {isEmailVerified ? 'Email verified' : 'Check your email'}
        </Text>

        {isEmailVerified ? (
          <Text style={styles.body}>
            Your address is confirmed. Let&apos;s finish setting up your account.
          </Text>
        ) : (
          <>
            <Text style={styles.body}>
              We sent a verification link to{' '}
              <Text style={styles.email}>{user?.email || 'your address'}</Text>. Open it to
              confirm the address is yours.
            </Text>
            <Text style={styles.note}>
              You can carry on setting up your account now — you will just need this done
              before submitting your first visit request.
            </Text>
          </>
        )}

        {notice && <Text style={styles.notice}>{notice}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.actions}>
        <NeuButton
          title={isEmailVerified ? 'Continue →' : 'Continue setting up →'}
          variant="accent"
          size="lg"
          fullWidth
          onPress={goOn}
        />

        {!isEmailVerified && (
          <>
            <NeuButton
              title="I've verified — check again"
              variant="ghost"
              size="md"
              fullWidth
              loading={checking}
              onPress={handleCheck}
            />

            <Pressable onPress={handleResend} disabled={cooldown > 0} style={styles.resendRow}>
              <Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the email'}
              </Text>
            </Pressable>

            <Pressable onPress={() => router.replace('/(onboarding)/sign-up')}>
              <Text style={styles.changeLink}>Wrong address? Change it</Text>
            </Pressable>
          </>
        )}
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
    paddingBottom: Spacing.xl,
    justifyContent: 'space-between',
  },
  content: { gap: Spacing.md, marginTop: Spacing['2xl'] },
  icon: { fontSize: 48 },
  title: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  body: { ...Typography.bodyMd, color: Colors.gray700, lineHeight: 22 },
  email: { fontWeight: '800', color: Colors.navy900 },
  note: { ...Typography.caption, color: Colors.gray500, lineHeight: 18 },
  notice: { ...Typography.caption, color: Colors.green600 },
  error: { ...Typography.caption, color: Colors.red600 },
  actions: { gap: Spacing.sm },
  resendRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  resendText: { ...Typography.bodySm, color: Colors.navy900, fontWeight: '700' },
  resendDisabled: { color: Colors.gray400, fontWeight: '600' },
  changeLink: {
    ...Typography.caption,
    color: Colors.gray600,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
