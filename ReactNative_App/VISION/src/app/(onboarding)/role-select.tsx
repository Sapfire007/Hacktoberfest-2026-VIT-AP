/**
 * RoleSelect Screen — Onboarding Role Selector
 * 
 * Four cards: three for self-registering roles, plus a Teacher / Faculty card.
 *
 * Teacher / Faculty accounts are admin-provisioned and cannot be self-created, so
 * selecting that card routes to the staff-login screen with the Faculty tab pre-selected
 * instead of going through the sign-up flow.
 *
 * Security and Admin remain behind the understated staff link at the bottom.
 *
 * The selection made here is a *request*, carried to signup and sent to the backend, which
 * decides the account's actual role. It is not an authorization state.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth, UserRoleType, VisitorSubtype } from '@/context/AuthContext';
import { Icon, IconName } from '@/components/ui/Icon';

interface RoleOption {
  role: UserRoleType;
  title: string;
  subtitle: string;
  icon: IconName;
  iconColor: string;
}

const ROLES: RoleOption[] = [
  {
    role: 'visitor',
    title: 'Visitor / Vendor',
    subtitle: 'Guest, Alumni, Vendor or Guest Lecturer visiting campus',
    icon: 'visitor',
    iconColor: Colors.blue600,
  },
  {
    role: 'parent',
    title: 'Parent / Guardian',
    subtitle: 'Visiting your student ward on campus',
    icon: 'family',
    iconColor: Colors.orange600,
  },
  {
    role: 'student',
    title: 'VIT-AP Student',
    subtitle: 'Sponsor a visit for your parent or guardian',
    icon: 'student',
    iconColor: Colors.navy900,
  },
];

const VISITOR_SUBTYPES: { key: VisitorSubtype; label: string }[] = [
  { key: 'general', label: 'General Guest' },
  { key: 'alumni', label: 'VIT Alumni' },
  { key: 'vendor', label: 'Vendor / Delivery' },
  { key: 'guest_faculty', label: 'Guest Lecturer' },
  // Students visiting from other institutions are guests of the campus, so they are a
  // visitor subtype rather than a role of their own (VISION.md section 3.3).
  { key: 'external_student', label: 'Student from another institution' },
];

export default function RoleSelectScreen() {
  const router = useRouter();
  const { setPendingSignup } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRoleType>('visitor');
  const [selectedSubtype, setSelectedSubtype] = useState<VisitorSubtype>('general');

  const handleContinue = () => {
    // Held as a pending intention only. The backend assigns the real role at signup.
    setPendingSignup(selectedRole, selectedRole === 'visitor' ? selectedSubtype : undefined);
    router.push('/(onboarding)/sign-up');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Your Role</Text>
        <Text style={styles.subtitle}>Choose how you will be using the VISION platform</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {ROLES.map((item) => {
          const isSelected = selectedRole === item.role;

          return (
            <Pressable
              key={item.role}
              onPress={() => setSelectedRole(item.role)}
              style={[
                styles.roleCard,
                isSelected
                  ? neuInset(4, 8, '#F0F4F8')
                  : neuOutset(4, 8, Colors.neuSurface),
                isSelected && styles.selectedBorder,
              ]}
            >
              <View style={styles.iconCircle}>
                <Icon name={item.icon} size={28} color={item.iconColor} />
              </View>
              <View style={styles.roleTextContainer}>
                <Text style={[styles.roleTitle, isSelected && styles.selectedTitle]}>
                  {item.title}
                </Text>
                <Text style={styles.roleSubtitle}>{item.subtitle}</Text>
              </View>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
            </Pressable>
          );
        })}

        {/* Subtype Chip Row if Visitor selected */}
        {selectedRole === 'visitor' && (
          <View style={styles.subtypeSection}>
            <Text style={styles.subtypeHeader}>SELECT VISITOR TYPE:</Text>
            <View style={styles.chipRow}>
              {VISITOR_SUBTYPES.map((sub) => {
                const isSubSelected = selectedSubtype === sub.key;
                return (
                  <Pressable
                    key={sub.key}
                    onPress={() => setSelectedSubtype(sub.key)}
                    style={[
                      styles.chip,
                      isSubSelected
                        ? { backgroundColor: Colors.navy900 }
                        : neuOutset(3, 6, Colors.neuSurface),
                    ]}
                  >
                    <Text
                      style={[
                        Typography.caption,
                        { color: isSubSelected ? Colors.white : Colors.gray700, fontWeight: '700' },
                      ]}
                    >
                      {sub.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <NeuButton
          title="Continue →"
          variant="accent"
          size="lg"
          fullWidth
          onPress={handleContinue}
        />

        <Pressable
          onPress={() => router.push('/(onboarding)/sign-in')}
          style={styles.secondaryLink}
        >
          <Text style={styles.secondaryLinkText}>
            Already have an account? <Text style={styles.secondaryStrong}>Sign in</Text>
          </Text>
        </Pressable>

        <View style={styles.staffDivider} />

        <Pressable
          onPress={() => router.push('/(onboarding)/staff-login')}
          style={styles.staffLink}
        >
          <Text style={styles.staffLinkText}>
            Security or Admin? Sign in with your employee ID
          </Text>
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
  },
  header: {
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
    marginTop: 4,
  },
  scrollContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
  },
  selectedBorder: {
    borderWidth: 2,
    borderColor: Colors.navy900,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
  },
  roleTextContainer: {
    flex: 1,
    gap: 2,
  },
  roleTitle: {
    ...Typography.headlineSm,
    fontSize: 17,
    color: Colors.gray900,
  },
  selectedTitle: {
    color: Colors.navy900,
    fontWeight: '800',
  },
  roleSubtitle: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.navy900,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.navy900,
  },
  subtypeSection: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  subtypeHeader: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  footer: {
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  secondaryLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  secondaryLinkText: {
    ...Typography.bodySm,
    color: Colors.gray600,
  },
  secondaryStrong: {
    color: Colors.navy900,
    fontWeight: '800',
  },
  staffDivider: {
    height: 1,
    backgroundColor: Colors.gray300,
    marginVertical: Spacing.xs,
  },
  staffLink: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  staffLinkText: {
    ...Typography.caption,
    color: Colors.gray600,
    textDecorationLine: 'underline',
  },
});
