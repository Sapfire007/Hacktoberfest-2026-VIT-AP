/**
 * Visitor Home Screen — Core Command Center
 * 
 * Faithfully recreates Stitch Visitor: Home (Refined) screen.
 * Displays NeuHeader, "+ New Visit Request" button, Active Permit card,
 * and Recent Requests list with status chips.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { NeuButton } from '@/components/ui/NeuButton';
import { PermitCard } from '@/components/ui/PermitCard';
import { RequestCard } from '@/components/ui/RequestCard';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

export default function VisitorHomeScreen() {
  const router = useRouter();
  const { user, role } = useAuth();
  const { requests, activePermit, unreadNotificationCount, gatePasses } = useApp();
  const openPasses = gatePasses.filter((p) => p.active);

  const handleNewRequest = () => {
    router.push('/(main)/requests/new');
  };

  return (
    <View style={styles.container}>
      <NeuHeader
        unreadCount={unreadNotificationCount}
        onNotificationPress={() => router.push('/(main)/notifications')}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/*
          The demo "switch role" banner that used to sit here is gone. It called
          switchRole(), which replaced the signed-in user with a hardcoded mock — an
          authorization bypass wearing a convenience feature's clothes. A role now comes
          from the account and changes only when an admin changes it.
        */}
        <View style={[styles.roleSwitchBanner, neuOutset(2, 4, Colors.neuSurface)]}>
          <Text style={styles.roleSwitchLabel}>
            Signed in as <Text style={styles.roleName}>{user.name}</Text>
            {role ? ` (${role.toUpperCase()})` : ''}
          </Text>
          <Pressable onPress={() => router.push('/(main)/profile')} style={styles.switchLink}>
            <View style={styles.switchLinkContent}>
              <Text style={styles.switchText}>Profile</Text>
              <Icon name="settings" size={16} color={Colors.blue500} />
            </View>
          </Pressable>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome, {user.name.split(' ')[0]}</Text>
          <Text style={styles.welcomeSubtitle}>Manage your visits and active permits.</Text>

          <NeuButton
            title="+ New Visit Request"
            variant="navy"
            size="lg"
            fullWidth
            onPress={handleNewRequest}
            style={styles.newRequestBtn}
          />
        </View>

        {/* Active Permit Section */}
        {activePermit && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {activePermit.status === 'approved' ? 'Approved Permit (Pending Verification)' : 'Active Permit'}
            </Text>
            <Pressable onPress={() => router.push(`/(main)/permit/${activePermit.id}`)}>
              <PermitCard
                permitId={activePermit.id}
                destination={activePermit.destination}
                purpose={activePermit.purpose}
                requesterName={activePermit.requesterName}
                date={activePermit.date}
                validityTimeLeft={activePermit.validityTimeLeft}
                qrPayload={activePermit.status === 'permit_active' ? activePermit.qrPayload : undefined}
                isOfflineAvailable={activePermit.isOfflineAvailable}
                status={activePermit.status as 'approved' | 'permit_active'}
                requestId={activePermit.id}
              />
            </Pressable>
          </View>
        )}

        {/* Passes security sent to this account (walk-in and regular passes) */}
        {openPasses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gate Passes</Text>
            {openPasses.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => router.push(`/(main)/passes/${p.key}` as never)}
                style={[styles.passRow, neuOutset(4, 8, Colors.neuSurface)]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.passTitle} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.passMeta}>{p.passCode}  ·  {p.status}</Text>
                </View>
                <Text style={styles.passAction}>Show QR →</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Recent Requests Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Requests</Text>
            <Pressable onPress={() => router.push('/(main)/requests')}>
              <Text style={styles.viewAllText}>View All →</Text>
            </Pressable>
          </View>

          {requests.slice(0, 3).map((req) => (
            <RequestCard
              key={req.id}
              id={req.id}
              destination={req.destination}
              purpose={req.purpose}
              hostName={req.targetFacultyName}
              hostPhotoURL={req.targetFacultyPhotoURL}
              dateTime={`${req.date} • ${req.timeWindow}`}
              status={req.status}
              onPress={() => router.push(`/(main)/requests/${req.id}`)}
              onActionPress={() => {
                if (req.status === 'approved' && req.permitId) {
                  // The permit screen loads by request id; permitId is only the printed code.
                  router.push(`/(main)/permit/${req.id}`);
                } else {
                  router.push(`/(main)/requests/${req.id}`);
                }
              }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    gap: Spacing.lg,
  },
  roleSwitchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.lg,
    marginTop: Spacing.xs,
  },
  roleSwitchLabel: {
    ...Typography.tiny,
    color: Colors.gray600,
  },
  roleName: {
    color: Colors.navy900,
    fontWeight: '800',
  },
  switchLink: {
    padding: 2,
  },
  switchLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  switchText: {
    ...Typography.tiny,
    color: Colors.blue500,
    fontWeight: '700',
  },
  welcomeSection: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  welcomeTitle: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
  },
  welcomeSubtitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    marginBottom: Spacing.sm,
  },
  newRequestBtn: {
    backgroundColor: Colors.navy900,
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
  },
  passTitle: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '800' },
  passMeta: { ...Typography.caption, color: Colors.gray600 },
  passAction: { ...Typography.caption, color: Colors.orange600, fontWeight: '800' },
  section: {
    gap: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...Typography.headlineSm,
    fontSize: 20,
    color: Colors.navy900,
    fontWeight: '800',
  },
  viewAllText: {
    ...Typography.buttonSm,
    color: Colors.orange600,
    fontWeight: '700',
  },
});
