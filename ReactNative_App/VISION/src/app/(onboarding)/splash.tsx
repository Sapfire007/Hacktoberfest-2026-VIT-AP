/**
 * Splash Screen — Onboarding Landing Page
 * 
 * Recreates Stitch Onboarding Welcome screen with soft neumorphic branding,
 * official VIT-AP logo, minimalist vector VisionEyeLogo emblem, and Get Started CTA.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuDarkOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { VisionEyeLogo } from '@/components/ui/VisionEyeLogo';
import { useAuth, homeRouteForRole } from '@/context/AuthContext';

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, role, user, isLoading } = useAuth();
  const navigationAttempted = React.useRef(false);

  // Redirect authenticated users
  useEffect(() => {
    // Only navigate once per mount
    if (navigationAttempted.current) return;
    
    if (!isLoading && isAuthenticated && role && user) {
      navigationAttempted.current = true;
      
      // Go directly to home - sign-in users should never be forced through onboarding
      // Onboarding happens only during the sign-up flow, not on subsequent sign-ins
      router.replace(homeRouteForRole(role) as never);
    }
  }, [isAuthenticated, role, user, isLoading, router]);

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <VisionEyeLogo size={64} color={Colors.white} accentColor={Colors.orange500} />
        <ActivityIndicator size="large" color={Colors.orange500} style={{ marginTop: Spacing.xl }} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Show splash screen for unauthenticated users
  return (
    <View style={styles.container}>
      {/* Top University Emblem Header */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/vit_ap_logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      {/* Center Vision Eye Emblem */}
      <View style={styles.centerSection}>
        <View style={[styles.eyeEmblemCard, neuDarkOutset(12, 24, '#0F2D52')]}>
          <VisionEyeLogo size={64} color={Colors.white} accentColor={Colors.orange500} />
        </View>

        <Text style={styles.brandTitle}>VISION</Text>
        <Text style={styles.tagline}>
          Every Entry Verified,{'\n'}Every Visit Secured.
        </Text>
      </View>

      {/* Bottom CTA Actions */}
      <View style={styles.bottomSection}>
        <NeuButton
          title="Get Started →"
          variant="accent"
          size="lg"
          fullWidth
          onPress={() => router.push('/(onboarding)/role-select')}
        />

        <Pressable
          onPress={() => router.push('/(onboarding)/sign-in')}
          style={styles.loginLink}
        >
          <Text style={styles.loginText}>
            Already registered? <Text style={styles.loginBold}>Sign In</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy900,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing['3xl'],
    justifyContent: 'space-between',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.gray300,
    marginTop: Spacing.md,
  },
  header: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  logoImage: {
    width: 260,
    height: 80,
  },
  centerSection: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  eyeEmblemCard: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  brandTitle: {
    ...Typography.headlineXl,
    color: Colors.white,
    fontSize: 42,
    letterSpacing: 4,
    fontWeight: '900',
    textAlign: 'center',
  },
  tagline: {
    ...Typography.bodyLg,
    color: Colors.gray300,
    textAlign: 'center',
    lineHeight: 28,
  },
  bottomSection: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  loginLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  loginText: {
    ...Typography.bodyMd,
    color: Colors.gray400,
  },
  loginBold: {
    color: Colors.orange500,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
