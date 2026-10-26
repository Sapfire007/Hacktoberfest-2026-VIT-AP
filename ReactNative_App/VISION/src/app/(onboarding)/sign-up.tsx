/**
 * Sign Up — email + password
 *
 * The primary way a Visitor, Parent or Student creates an account (Design.md section 5.1).
 * Email and password need no OAuth consent screen, no SHA-1 fingerprint and no redirect
 * URI, which is why this path works before any Google Cloud configuration exists.
 *
 * Google is offered below the divider as a convenience. Nothing here depends on it.
 */

import React, { useMemo, useState } from 'react';
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
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { GoogleLogo } from '@/components/ui/GoogleLogo';
import { useAuth } from '@/context/AuthContext';
import { AppAuthError } from '@/services/firebase.auth';

const MIN_PASSWORD_LENGTH = 8;

/** Institutional domains that mark an account as an enrolled VIT-AP student. */
const STUDENT_DOMAINS = ['vitap.ac.in', 'vitapstudent.ac.in'];

type Strength = { score: 0 | 1 | 2 | 3; label: string; color: string };

/**
 * Length dominates the score deliberately. A long passphrase is stronger than a short
 * string with a symbol bolted on, and scoring it otherwise teaches the wrong habit.
 */
function scorePassword(password: string): Strength {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { score: 0, label: 'Too short', color: Colors.red600 };
  }

  const variety =
    (/[a-z]/.test(password) ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/[0-9]/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);

  if (password.length >= 16 || (password.length >= 12 && variety >= 3)) {
    return { score: 3, label: 'Strong', color: Colors.green600 };
  }
  if (password.length >= 12 || variety >= 3) {
    return { score: 2, label: 'Good', color: Colors.orange600 };
  }
  return { score: 1, label: 'Weak', color: Colors.orange600 };
}

export default function SignUpScreen() {
  const router = useRouter();
  const { signUpWithEmail, signInWithGoogle, pendingRole, pendingSubtype } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const strength = useMemo(() => scorePassword(password), [password]);

  const isStudentEmail = useMemo(() => {
    const domain = email.split('@')[1]?.toLowerCase();
    return Boolean(domain && STUDENT_DOMAINS.some((d) => domain.endsWith(d)));
  }, [email]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email.includes('@') || !email.includes('.')) {
      errors.email = 'Enter a valid email address';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `At least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (password !== confirm) {
      errors.confirm = 'Passwords do not match';
    }
    if (!acceptedTerms) {
      errors.terms = 'Please accept the terms to continue';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignUp = async () => {
    setFormError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      await signUpWithEmail({
        email,
        password,
        role: pendingRole,
        visitorSubtype: pendingSubtype,
      });
      router.replace('/(onboarding)/verify-email');
    } catch (error) {
      // "Already registered" is not really an error — it means they have an account and
      // should sign in, so it is offered as a route rather than a dead end.
      if (error instanceof AppAuthError && error.code === 'email-in-use') {
        setFieldErrors({ email: 'This address is already registered' });
        setFormError('already-registered');
      } else {
        setFormError(error instanceof Error ? error.message : 'Could not create your account');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    try {
      setSubmitting(true);
      await signInWithGoogle(pendingRole, pendingSubtype);
      router.replace('/(onboarding)/identity-details');
    } catch (error) {
      if (error instanceof AppAuthError && error.code === 'cancelled') return;
      setFormError(error instanceof Error ? error.message : 'Google sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

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
        <View style={styles.header}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            You will use this email and password to sign in from now on.
          </Text>
        </View>

        <NeuInput
          label="EMAIL ADDRESS"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setFieldErrors((prev) => ({ ...prev, email: '' }));
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          error={fieldErrors.email}
        />

        {formError === 'already-registered' && (
          <Pressable onPress={() => router.replace('/(onboarding)/sign-in')}>
            <Text style={styles.inlineLink}>Sign in to that account instead →</Text>
          </Pressable>
        )}

        {pendingRole === 'student' && email.includes('@') && (
          <Text style={[styles.hint, isStudentEmail ? styles.hintOk : styles.hintWarn]}>
            {isStudentEmail
              ? 'Recognised as a VIT-AP student address.'
              : 'Use your VIT-AP address so your account is recognised as a student.'}
          </Text>
        )}

        <NeuInput
          label="PASSWORD"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setFieldErrors((prev) => ({ ...prev, password: '' }));
          }}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          error={fieldErrors.password}
          rightIcon={
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              <Text style={styles.showToggle}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          }
        />

        {password.length > 0 && (
          <View style={styles.strengthRow}>
            <View style={styles.strengthTrack}>
              {[1, 2, 3].map((step) => (
                <View
                  key={step}
                  style={[
                    styles.strengthSegment,
                    strength.score >= step && { backgroundColor: strength.color },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
          </View>
        )}

        <NeuInput
          label="CONFIRM PASSWORD"
          value={confirm}
          onChangeText={(text) => {
            setConfirm(text);
            setFieldErrors((prev) => ({ ...prev, confirm: '' }));
          }}
          placeholder="Re-enter your password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          error={fieldErrors.confirm}
        />

        <Pressable
          style={styles.termsRow}
          onPress={() => {
            setAcceptedTerms((v) => !v);
            setFieldErrors((prev) => ({ ...prev, terms: '' }));
          }}
        >
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
            {acceptedTerms && <Text style={styles.checkboxTick}>✓</Text>}
          </View>
          <Text style={styles.termsText}>
            I accept the Terms of Use and Privacy Policy.
          </Text>
        </Pressable>
        {Boolean(fieldErrors.terms) && <Text style={styles.error}>{fieldErrors.terms}</Text>}

        {/*
          Biometric consent is not bundled into this checkbox. It gets its own screen
          later in onboarding, because consent to face processing has to be a separate,
          explicit decision (PRD.md FR-REG-06).
        */}

        {formError && formError !== 'already-registered' && (
          <Text style={styles.error}>{formError}</Text>
        )}

        <NeuButton
          title="Create account"
          variant="accent"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={handleSignUp}
          style={styles.primaryButton}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          onPress={handleGoogle}
          disabled={submitting}
          style={[styles.googleButton, neuOutset(4, 8, Colors.neuSurface)]}
        >
          <GoogleLogo size={20} />
          <Text style={styles.googleText}>Sign up with Google</Text>
        </Pressable>

        <Pressable onPress={() => router.replace('/(onboarding)/sign-in')} style={styles.footerLink}>
          <Text style={styles.footerText}>
            Already have an account? <Text style={styles.footerStrong}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neuBackground },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['2xl'],
    gap: Spacing.md,
  },
  header: { marginBottom: Spacing.sm },
  title: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  subtitle: { ...Typography.bodyMd, color: Colors.gray600, marginTop: 4 },
  hint: { ...Typography.caption, marginTop: -Spacing.xs },
  hintOk: { color: Colors.green600 },
  hintWarn: { color: Colors.orange600 },
  inlineLink: {
    ...Typography.caption,
    color: Colors.navy900,
    fontWeight: '700',
    marginTop: -Spacing.xs,
  },
  showToggle: { ...Typography.caption, color: Colors.navy900, fontWeight: '700' },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: -Spacing.xs,
  },
  strengthTrack: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray300,
  },
  strengthLabel: { ...Typography.caption, fontWeight: '700' },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Colors.gray400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.navy900, borderColor: Colors.navy900 },
  checkboxTick: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  termsText: { ...Typography.caption, color: Colors.gray700, flex: 1 },
  error: { ...Typography.caption, color: Colors.red600 },
  primaryButton: { marginTop: Spacing.sm },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.gray300 },
  dividerText: { ...Typography.caption, color: Colors.gray500 },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  googleText: { ...Typography.bodyMd, color: Colors.gray800, fontWeight: '700' },
  footerLink: { alignItems: 'center', marginTop: Spacing.md },
  footerText: { ...Typography.bodySm, color: Colors.gray600 },
  footerStrong: { color: Colors.navy900, fontWeight: '800' },
});
