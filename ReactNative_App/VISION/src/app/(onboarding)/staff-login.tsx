/**
 * Staff Sign In — employee ID + password, one tab per institutional role
 *
 * Faculty, Security and Admin all authenticate the same way (VISION.md §3.2), so a single
 * form would be enough to sign all three in. The tabs are here for a different reason:
 * the three roles open completely different applications, and a gate officer starting a
 * shift should see that the app knows what they are about to do. Each tab states what
 * that role's app does, which is also the most honest place to say which parts are not
 * built yet.
 *
 * **The tab is a hint, not an authorization.** Nothing about the selected tab is sent to
 * the backend, and nothing about it decides where the user lands. The account's real role
 * arrives in a server-issued claim and `homeRouteForRole` routes on that — exactly as it
 * does on the visitor track. Letting a tab influence the destination would recreate the
 * client-side role selection the auth rebuild removed.
 *
 * If the signed-in role and the chosen tab disagree, the user is still routed by their
 * real role; the mismatch is only worth a note, because the usual cause is a person
 * tapping the wrong tab rather than anything being wrong.
 *
 * There is deliberately no "create an account" link. Institutional accounts are
 * provisioned by an admin (PRD.md FR-ADM-06) — offering a signup route here would be a
 * dead end that looks like a bug.
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
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { useAuth, homeRouteForRole, UserRoleType } from '@/context/AuthContext';
import { DEMO_STAFF_CREDENTIALS, DEMO_LOGIN_ENABLED } from '@/constants/demoCredentials';

type StaffTab = 'admin' | 'security' | 'faculty';

interface TabDefinition {
  key: StaffTab;
  label: string;
  icon: string;
  badge: string;
  title: string;
  subtitle: string;
  /** What this role's app actually does, in the order they will meet it. */
  capabilities: string[];
  accent: string;
}

const TABS: TabDefinition[] = [
  {
    key: 'admin',
    label: 'Admin',
    icon: '🛡️',
    badge: 'ADMINISTRATOR',
    title: 'Campus administration',
    subtitle: 'Provision staff accounts, review gate records and run reports.',
    capabilities: [
      'Provision and deactivate staff accounts',
      'Full gate history and on-campus roll',
      'Watchlist, analytics and reports',
    ],
    accent: Colors.navy900,
  },
  {
    key: 'security',
    label: 'Security',
    icon: '🚧',
    badge: 'GATE OFFICER',
    title: 'Gate operations',
    subtitle: 'Register walk-in visitors, issue QR passes and scan them out.',
    capabilities: [
      'Register a walk-in and issue a QR pass',
      'Read number plates with the camera',
      'Scan passes to close a visit on exit',
    ],
    accent: Colors.orange600,
  },
  {
    key: 'faculty',
    label: 'Faculty',
    icon: '🎓',
    badge: 'FACULTY / MENTOR',
    title: 'Visit approvals',
    subtitle: 'Approve or reject visit requests addressed to you.',
    capabilities: [
      'Approval inbox for visit requests',
      'Your advisees and their sponsored visits',
      'Visit history',
    ],
    accent: Colors.navy900,
  },
];

export default function StaffLoginScreen() {
  const router = useRouter();
  const { signInAsStaff } = useAuth();

  const [activeTab, setActiveTab] = useState<StaffTab>('security');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tab = TABS.find((candidate) => candidate.key === activeTab)!;
  const demo = DEMO_STAFF_CREDENTIALS[activeTab];

  /**
   * Switching tabs clears the fields.
   *
   * Carrying a half-typed admin ID into the security tab is confusing rather than helpful,
   * and it is the state that produces "my password is wrong" reports where the ID was
   * simply left over from the other tab.
   */
  const handleTabChange = (key: StaffTab) => {
    if (key === activeTab) return;
    setActiveTab(key);
    setEmployeeId('');
    setPassword('');
    setError(null);
    setNotice(null);
  };

  const handleUseDemo = () => {
    setEmployeeId(demo.employeeId);
    setPassword(demo.password);
    setError(null);
    setNotice(null);
  };

  const handleSignIn = async () => {
    setError(null);
    setNotice(null);

    if (!employeeId.trim() || !password) {
      setError('Enter your employee ID and password');
      return;
    }

    try {
      setSubmitting(true);
      const signedInRole = await signInAsStaff(employeeId.trim(), password);

      // Routed by the real role, never by the tab. The note below is informational only.
      if (signedInRole && signedInRole !== activeTab) {
        setNotice(`Signed in as ${signedInRole}. Opening the ${signedInRole} app.`);
      }

      router.replace(homeRouteForRole(signedInRole as UserRoleType) as never);
    } catch (err) {
      // The backend returns the same message for an unknown ID and a wrong password, so
      // this screen cannot be used to work out which employee IDs exist. Deactivated and
      // locked accounts come back with their own distinct messages.
      setError(err instanceof Error ? err.message : 'Employee ID or password is incorrect');
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
          <Text style={styles.staffBadge}>STAFF ACCESS</Text>
          <Text style={styles.title}>Sign in with your employee ID</Text>
          <Text style={styles.subtitle}>Select the role your account was provisioned for.</Text>
        </View>

        {/* Segmented tab bar */}
        <View style={[styles.tabBar, neuInset(3, 6, '#EDF1F6')]}>
          {TABS.map((candidate) => {
            const isActive = candidate.key === activeTab;

            return (
              <Pressable
                key={candidate.key}
                onPress={() => handleTabChange(candidate.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Sign in as ${candidate.label}`}
                style={[
                  styles.tabButton,
                  isActive && [neuOutset(3, 6, Colors.neuSurface), styles.tabButtonActive],
                ]}
              >
                <Text style={styles.tabIcon}>{candidate.icon}</Text>
                <Text
                  style={[
                    styles.tabLabel,
                    isActive && { color: candidate.accent, fontWeight: '800' },
                  ]}
                >
                  {candidate.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* What this role's app does. The list is the honest part: it names the
            capabilities that exist, so nobody signs in expecting a console that is
            still a placeholder. */}
        <View style={[styles.roleCard, neuOutset(4, 8, Colors.neuSurface)]}>
          <Text style={[styles.roleBadge, { color: tab.accent }]}>{tab.badge}</Text>
          <Text style={styles.roleTitle}>{tab.title}</Text>
          <Text style={styles.roleSubtitle}>{tab.subtitle}</Text>

          <View style={styles.capabilityList}>
            {tab.capabilities.map((capability) => (
              <View key={capability} style={styles.capabilityRow}>
                <View style={[styles.capabilityDot, { backgroundColor: tab.accent }]} />
                <Text style={styles.capabilityText}>{capability}</Text>
              </View>
            ))}
          </View>
        </View>

        <NeuInput
          label="EMPLOYEE ID"
          value={employeeId}
          // Uppercased as typed: IDs are printed on cards in a fixed case, and the
          // backend normalises the same way, so the field matches what people see.
          onChangeText={(text) => setEmployeeId(text.toUpperCase())}
          placeholder={DEMO_LOGIN_ENABLED ? demo.employeeId : 'e.g. VITAP1042'}
          autoCapitalize="characters"
          autoCorrect={false}
          textContentType="username"
        />

        <NeuInput
          label="PASSWORD"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          textContentType="password"
          rightIcon={
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              <Text style={styles.showToggle}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          }
        />

        {notice && <Text style={styles.notice}>{notice}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        <NeuButton
          title={`Sign in as ${tab.label}`}
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={handleSignIn}
          style={styles.button}
        />

        {/*
          Development only. DEMO_LOGIN_ENABLED is false in any release build unless the
          flag is deliberately set, so this whole block is absent from a shipped app.
        */}
        {DEMO_LOGIN_ENABLED && (
          <Pressable
            onPress={handleUseDemo}
            style={[styles.demoCard, neuInset(2, 5, '#F3F6FA')]}
          >
            <Text style={styles.demoLabel}>DEV — TEST CREDENTIALS</Text>
            <Text style={styles.demoValue}>
              {demo.employeeId}  ·  {demo.password}
            </Text>
            <Text style={styles.demoHint}>
              Tap to fill. Create these first with{' '}
              <Text style={styles.demoMono}>npm run seed:demo-staff</Text> in
              Backend/Node_Backend.
            </Text>
          </Pressable>
        )}

        {/*
          No self-service reset. An employee ID has no verified address attached to send a
          link to, so recovery goes through an admin (PRD.md FR-PROF-07).
        */}
        <Text style={styles.helpText}>
          Forgotten your password? Contact your system administrator.
        </Text>

        <Pressable onPress={() => router.back()} style={styles.footerLink}>
          <Text style={styles.footerText}>← Back to visitor sign-in</Text>
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
  header: { marginBottom: Spacing.xs, gap: 4 },
  staffBadge: {
    ...Typography.tiny,
    color: Colors.orange600,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  subtitle: { ...Typography.bodyMd, color: Colors.gray600 },

  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.lg,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    gap: 2,
  },
  tabButtonActive: { backgroundColor: Colors.neuSurface },
  tabIcon: { fontSize: 18 },
  tabLabel: { ...Typography.caption, color: Colors.gray600, fontWeight: '700' },

  roleCard: { padding: Spacing.lg, borderRadius: Radius.xl, gap: 4 },
  roleBadge: { ...Typography.tiny, fontWeight: '800', letterSpacing: 1 },
  roleTitle: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800' },
  roleSubtitle: { ...Typography.bodySm, color: Colors.gray600 },
  capabilityList: { marginTop: Spacing.sm, gap: 6 },
  capabilityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  capabilityDot: { width: 5, height: 5, borderRadius: 3 },
  capabilityText: { ...Typography.caption, color: Colors.gray700, flex: 1 },

  showToggle: { ...Typography.caption, color: Colors.navy900, fontWeight: '700' },
  notice: { ...Typography.caption, color: Colors.green600 },
  error: { ...Typography.caption, color: Colors.red600 },
  button: { marginTop: Spacing.xs },

  demoCard: { padding: Spacing.md, borderRadius: Radius.lg, gap: 4 },
  demoLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontWeight: '800',
    letterSpacing: 1,
  },
  demoValue: {
    ...Typography.bodySm,
    color: Colors.navy900,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  demoHint: { ...Typography.tiny, color: Colors.gray500, lineHeight: 15 },
  demoMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  helpText: {
    ...Typography.caption,
    color: Colors.gray500,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  footerLink: { alignItems: 'center', marginTop: Spacing.md },
  footerText: { ...Typography.bodySm, color: Colors.gray600 },
});
