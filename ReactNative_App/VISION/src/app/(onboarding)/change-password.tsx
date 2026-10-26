/**
 * Change Password — staff and faculty
 *
 * Where a staff member lands when their account is flagged `mustChangePassword`: a new
 * account the admin created, a password the admin reset, or a faculty password rotated with
 * `npm run reset:faculty-password`. Someone else chose that password and has seen it, so it
 * is replaced before the account is used. RoleGuard sends every staff shell here until it
 * is done.
 *
 * The server repeats every check made here (length, different from the current one, not
 * the employee ID); these are only there to answer quickly.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { useAuth, homeRouteForRole } from '@/context/AuthContext';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { role, employeeId, changeStaffPassword, logout } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!current) return setError('Enter your current password');
    if (next.length < 8) return setError('The new password needs at least 8 characters');
    if (next.length > 128) return setError('The new password is too long');
    if (next !== confirm) return setError('The new passwords do not match');
    if (next === current) return setError('Choose a password different from the current one');
    if (employeeId && next.trim().toUpperCase() === employeeId.toUpperCase()) {
      return setError('The password must not be your employee ID');
    }

    try {
      setSubmitting(true);
      await changeStaffPassword(current, next);
      router.replace(homeRouteForRole(role) as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/(onboarding)/splash');
  };

  const clearError = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setError(null);
  };

  const toggle = (
    <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
      <Text style={styles.showToggle}>{show ? 'Hide' : 'Show'}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.badge}>ACCOUNT SECURITY</Text>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.subtitle}>
            Your current password was set by an administrator. Replace it with one only you
            know before continuing.
          </Text>
        </View>

        <NeuInput
          label="CURRENT PASSWORD"
          value={current}
          onChangeText={clearError(setCurrent)}
          placeholder="The password you were given"
          secureTextEntry={!show}
          autoCapitalize="none"
          textContentType="password"
          rightIcon={toggle}
        />
        <NeuInput
          label="NEW PASSWORD (8+ CHARACTERS)"
          value={next}
          onChangeText={clearError(setNext)}
          placeholder="New password"
          secureTextEntry={!show}
          autoCapitalize="none"
          textContentType="newPassword"
        />
        <NeuInput
          label="CONFIRM NEW PASSWORD"
          value={confirm}
          onChangeText={clearError(setConfirm)}
          placeholder="Type it again"
          secureTextEntry={!show}
          autoCapitalize="none"
          textContentType="newPassword"
        />

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <NeuButton
          title="Change password"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={handleSubmit}
          style={styles.submit}
        />

        <Pressable onPress={handleSignOut} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['3xl'],
    gap: Spacing.md,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  badge: {
    ...Typography.tiny,
    color: Colors.navy900,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodySm,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },
  showToggle: {
    ...Typography.caption,
    color: Colors.navy900,
    fontWeight: '700',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.red600,
  },
  submit: {
    marginTop: Spacing.sm,
  },
  signOut: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
  },
  signOutText: {
    ...Typography.bodySm,
    color: Colors.gray600,
  },
});
