/**
 * Profile Form Screen — Structured User Profile Onboarding
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuInput } from '@/components/ui/NeuInput';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';

export default function ProfileFormScreen() {
  const router = useRouter();
  const { user, updateProfile, pendingRole } = useAuth();

  const [fullName, setFullName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [organization, setOrganization] = useState('Tech Guest Org');
  const [studentWard, setStudentWard] = useState('Rahul K. (24BCE7012)');

  const handleSubmit = () => {
    updateProfile({
      name: fullName,
      email,
    });
    router.push('/(onboarding)/consent');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Personal Profile</Text>
        <Text style={styles.subtitle}>Complete your profile details to finalize registration</Text>
      </View>

      <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
        <NeuInput
          label="FULL NAME"
          value={fullName}
          onChangeText={setFullName}
          placeholder="e.g. Alex Morgan"
        />

        <NeuInput
          label="EMAIL ADDRESS"
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
        />

        {pendingRole === 'parent' ? (
          <NeuInput
            label="LINKED STUDENT WARD (Name or Reg No)"
            value={studentWard}
            onChangeText={setStudentWard}
            placeholder="e.g. Rahul K. (24BCE7012)"
          />
        ) : (
          <NeuInput
            label="COMPANY / INSTITUTION (Optional)"
            value={organization}
            onChangeText={setOrganization}
            placeholder="e.g. Amazon / IIT Madras"
          />
        )}
      </ScrollView>

      <View style={styles.footer}>
        <NeuButton
          title="Save & Proceed →"
          variant="accent"
          size="lg"
          fullWidth
          onPress={handleSubmit}
        />
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
  formContent: {
    gap: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  footer: {
    paddingVertical: Spacing.lg,
  },
});
