/**
 * Faculty Login — dedicated sign-in for teachers and mentors
 *
 * A focused, single-purpose screen. Faculty authenticate with the same backend
 * staff endpoint (employee ID + password), but they see a clean interface that
 * speaks directly to them — no Admin/Security tabs, no shared form ambiguity.
 *
 * The username field maps to the backend's `employeeId` parameter; the faculty
 * credentials JSON uses `username` as the login key.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { useAuth, homeRouteForRole, UserRoleType } from '@/context/AuthContext';

export default function FacultyLoginScreen() {
  const router = useRouter();
  const { signInAsFaculty } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);



  // Subtle entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSignIn = async () => {
    setError(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setError('Please enter your username and password');
      return;
    }

    try {
      setSubmitting(true);
      const signedInRole = await signInAsFaculty(trimmedUsername, password);

      router.replace(homeRouteForRole(signedInRole as UserRoleType) as never);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Username or password is incorrect'
      );
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
        {/* Back button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Animated.View
          style={[
            styles.heroSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Faculty badge */}
          <View style={styles.badgeContainer}>
            <View style={[styles.iconBadge, neuOutset(4, 8, Colors.neuSurface)]}>
              <Text style={styles.heroIcon}>👨‍🏫</Text>
            </View>
          </View>

          <Text style={styles.roleBadge}>FACULTY ACCESS</Text>
          <Text style={styles.title}>Welcome, Professor</Text>
          <Text style={styles.subtitle}>
            Sign in to manage visit approvals, advisees and campus access requests
          </Text>
        </Animated.View>

        {/* Info card */}
        <View style={[styles.infoCard, neuOutset(4, 8, Colors.neuSurface)]}>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📥</Text>
            <Text style={styles.infoText}>Approve or reject visit requests</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🎓</Text>
            <Text style={styles.infoText}>View and manage your advisees</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>⏱️</Text>
            <Text style={styles.infoText}>Track approval history</Text>
          </View>
        </View>

        {/* Login form */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <NeuInput
            label="USERNAME"
            value={username}
            onChangeText={(text) => {
              setUsername(text);
              setError(null);
            }}
            placeholder="e.g. srinivas170004"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
          />

          <NeuInput
            label="PASSWORD"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError(null);
            }}
            placeholder="Your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            textContentType="password"
            rightIcon={
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Text style={styles.showToggle}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            }
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <NeuButton
            title="Sign In"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={handleSignIn}
            style={styles.signInButton}
          />
        </Animated.View>

        {/* Help text */}
        <Text style={styles.helpText}>
          Your login credentials were provided by the university administration.
          {'\n'}Contact your department admin if you need help.
        </Text>

        <View style={styles.securityNote}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>
            Secured with institutional authentication
          </Text>
        </View>
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
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing['3xl'],
    gap: Spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  backText: {
    ...Typography.bodySm,
    color: Colors.gray600,
  },

  heroSection: {
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  badgeContainer: {
    marginBottom: Spacing.sm,
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neuSurface,
  },
  heroIcon: {
    fontSize: 34,
  },
  roleBadge: {
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

  infoCard: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  infoIcon: {
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  infoText: {
    ...Typography.bodySm,
    color: Colors.gray700,
    flex: 1,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.gray200,
    marginLeft: 36,
  },

  showToggle: {
    ...Typography.caption,
    color: Colors.navy900,
    fontWeight: '700',
  },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
  },
  errorIcon: {
    fontSize: 14,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.red600,
    flex: 1,
  },

  signInButton: {
    marginTop: Spacing.md,
  },

  helpText: {
    ...Typography.caption,
    color: Colors.gray500,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.sm,
  },

  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  securityIcon: {
    fontSize: 12,
  },
  securityText: {
    ...Typography.tiny,
    color: Colors.gray400,
  },
});
