/**
 * Sign In — Role Selection + Credentials
 *
 * Users must select their role (Visitor, Parent, Student) before entering credentials.
 * This helps route them to the correct home screen after authentication.
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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { GoogleLogo } from '@/components/ui/GoogleLogo';
import { useAuth, homeRouteForRole, UserRoleType } from '@/context/AuthContext';
import { AppAuthError } from '@/services/firebase.auth';
import { Icon, IconName } from '@/components/ui/Icon';

interface RoleOption {
  role: UserRoleType;
  title: string;
  icon: IconName;
  iconColor: string;
}

const SIGNIN_ROLES: RoleOption[] = [
  { role: 'visitor', title: 'Visitor / Vendor', icon: 'visitor', iconColor: Colors.blue600 },
  { role: 'parent', title: 'Parent / Guardian', icon: 'family', iconColor: Colors.orange600 },
  { role: 'student', title: 'VIT-AP Student', icon: 'student', iconColor: Colors.navy900 },
  { role: 'faculty', title: 'Teacher / Faculty', icon: 'teacher', iconColor: Colors.green600 },
];

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithEmail, signInWithGoogle, sendPasswordReset, signInAsFaculty } = useAuth();

  // Step 1: Role Selection
  const [selectedRole, setSelectedRole] = useState<UserRoleType | null>(null);
  
  // Step 2: Credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  /**
   * No VISION account behind this sign-in. Offer sign-up instead of an error.
   *
   * Sign-up starts at role select, not the sign-up form: the account's role has to be
   * chosen first, and skipping that step is exactly how people were silently being
   * registered as visitors.
   */
  const promptCreateAccount = () => {
    Alert.alert(
      'No account found',
      'There is no VISION account for this sign-in yet. Create one to continue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create account',
          onPress: () => router.replace('/(onboarding)/role-select'),
        },
      ]
    );
  };

  const handleSignIn = async () => {
    setError(null);
    setResetNotice(null);

    // Faculty uses username, others use email
    if (selectedRole === 'faculty') {
      if (!email.trim() || !password) {
        setError('Enter your username and password');
        return;
      }

      try {
        setSubmitting(true);
        const signedInRole = await signInAsFaculty(email.trim(), password);
        
        if (signedInRole) {
          router.replace(homeRouteForRole(signedInRole as UserRoleType) as never);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Username or password is incorrect');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Non-faculty roles use email
    if (!email.trim() || !password) {
      setError('Enter your email address and password');
      return;
    }

    try {
      setSubmitting(true);
      const { role: signedInRole, profile } = await signInWithEmail(email, password);
      
      // Sign-in successful - go directly to home
      // Onboarding only happens during sign-up, never during sign-in
      if (signedInRole) {
        router.replace(homeRouteForRole(signedInRole) as never);
      }
    } catch (err) {
      if (err instanceof AppAuthError && err.code === 'no-account') {
        promptCreateAccount();
        return;
      }
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      setSubmitting(true);
      // allowRegistration=false: signing in never creates an account.
      const { role: signedInRole, profile } = await signInWithGoogle(undefined, undefined, false);
      
      // Sign-in successful - go directly to home
      // Onboarding only happens during sign-up, never during sign-in
      if (signedInRole) {
        router.replace(homeRouteForRole(signedInRole) as never);
      }
    } catch (err) {
      if (err instanceof AppAuthError && err.code === 'cancelled') return;
      if (err instanceof AppAuthError && err.code === 'no-account') {
        promptCreateAccount();
        return;
      }
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * The confirmation is worded identically whether or not the address is registered.
   * A truthful "no account for that address" would turn this into a way to test which
   * addresses exist.
   */
  const handleForgotPassword = async () => {
    setError(null);

    if (!email.trim()) {
      setError('Enter your email address first, then tap "Forgot password?"');
      return;
    }

    try {
      setSubmitting(true);
      await sendPasswordReset(email);
      setResetNotice(
        'If an account exists for that address, a reset link is on its way. Check your inbox.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset link');
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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            {selectedRole ? 'Sign in to continue' : 'Select your role to sign in'}
          </Text>
        </View>

        {/* Step 1: Role Selection */}
        {!selectedRole ? (
          <>
            <Text style={styles.stepTitle}>I AM SIGNING IN AS:</Text>
            
            {SIGNIN_ROLES.map((item) => (
              <Pressable
                key={item.role}
                onPress={() => setSelectedRole(item.role)}
                style={[styles.roleCard, neuOutset(4, 8, Colors.neuSurface)]}
              >
                <View style={styles.iconCircle}>
                  <Icon name={item.icon} size={24} color={item.iconColor} />
                </View>
                <Text style={styles.roleTitle}>{item.title}</Text>
                <Text style={styles.arrow}>→</Text>
              </Pressable>
            ))}

            <View style={styles.dividerSection}>
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
              <Text style={styles.googleText}>Sign in with Google</Text>
            </Pressable>
          </>
        ) : (
          /* Step 2: Credentials Form */
          <>
            {/* Selected Role Indicator */}
            <Pressable
              onPress={() => setSelectedRole(null)}
              style={[styles.selectedRoleCard, neuInset(3, 6, Colors.neuSurface)]}
            >
              <View style={styles.selectedRoleLeft}>
                <Icon 
                  name={SIGNIN_ROLES.find(r => r.role === selectedRole)?.icon || 'profile'} 
                  size={20} 
                  color={SIGNIN_ROLES.find(r => r.role === selectedRole)?.iconColor || Colors.gray600}
                />
                <View>
                  <Text style={styles.selectedRoleLabel}>SIGNING IN AS:</Text>
                  <Text style={styles.selectedRoleTitle}>
                    {SIGNIN_ROLES.find(r => r.role === selectedRole)?.title}
                  </Text>
                </View>
              </View>
              <Text style={styles.changeLink}>Change</Text>
            </Pressable>

            <NeuInput
              label={selectedRole === 'faculty' ? 'USERNAME' : 'EMAIL ADDRESS'}
              value={email}
              onChangeText={setEmail}
              placeholder={selectedRole === 'faculty' ? 'Your faculty username' : 'you@example.com'}
              keyboardType={selectedRole === 'faculty' ? 'default' : 'email-address'}
              autoCapitalize="none"
              autoComplete={selectedRole === 'faculty' ? 'username' : 'email'}
              textContentType={selectedRole === 'faculty' ? 'username' : 'emailAddress'}
            />

            <NeuInput
              label="PASSWORD"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              rightIcon={
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Text style={styles.showToggle}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              }
            />

            {selectedRole !== 'faculty' && (
              <Pressable onPress={handleForgotPassword} style={styles.forgotRow}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}

            {selectedRole === 'faculty' && (
              <Text style={styles.facultyNote}>
                Contact IT support to reset your faculty password
              </Text>
            )}

            {resetNotice && <Text style={styles.notice}>{resetNotice}</Text>}
            {error && <Text style={styles.error}>{error}</Text>}

            <NeuButton
              title="Sign in"
              variant="accent"
              size="lg"
              fullWidth
              loading={submitting}
              onPress={handleSignIn}
            />

            <View style={styles.dividerSection}>
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
              <Text style={styles.googleText}>Sign in with Google</Text>
            </Pressable>
          </>
        )}

        <Pressable
          onPress={() => router.replace('/(onboarding)/role-select')}
          style={styles.footerLink}
        >
          <Text style={styles.footerText}>
            New here? <Text style={styles.footerStrong}>Create an account</Text>
          </Text>
        </Pressable>

        <View style={styles.staffDivider} />

        <Pressable
          onPress={() => router.push('/(onboarding)/staff-login')}
          style={styles.staffLink}
        >
          <Text style={styles.staffLinkText}>
            Staff, Security or Admin? Sign in with your employee ID
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
  stepTitle: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTitle: {
    ...Typography.headlineSm,
    fontSize: 17,
    color: Colors.gray900,
    flex: 1,
  },
  arrow: {
    ...Typography.h3,
    color: Colors.gray400,
  },
  selectedRoleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
  },
  selectedRoleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  selectedRoleLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontSize: 10,
  },
  selectedRoleTitle: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '700',
  },
  changeLink: {
    ...Typography.caption,
    color: Colors.navy900,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  showToggle: { ...Typography.caption, color: Colors.navy900, fontWeight: '700' },
  forgotRow: { alignSelf: 'flex-end', marginTop: -Spacing.xs },
  forgotText: { ...Typography.caption, color: Colors.navy900, fontWeight: '700' },
  facultyNote: { 
    ...Typography.caption, 
    color: Colors.gray600, 
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  notice: { ...Typography.caption, color: Colors.green600 },
  error: { ...Typography.caption, color: Colors.red600 },
  dividerSection: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: Spacing.md,
    marginVertical: Spacing.xs,
  },
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
  footerLink: { alignItems: 'center', marginTop: Spacing.sm },
  footerText: { ...Typography.bodySm, color: Colors.gray600 },
  footerStrong: { color: Colors.navy900, fontWeight: '800' },
  staffDivider: {
    height: 1,
    backgroundColor: Colors.gray300,
    marginTop: Spacing.lg,
  },
  staffLink: { alignItems: 'center', paddingVertical: Spacing.sm },
  staffLinkText: { ...Typography.caption, color: Colors.gray600, textDecorationLine: 'underline' },
});
