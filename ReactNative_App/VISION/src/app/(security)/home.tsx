/**
 * Security gate home — the officer's shift screen.
 *
 * Two actions dominate a gate shift and they are the two large buttons: register someone
 * arriving, and scan someone out. Everything else is secondary and sized accordingly.
 *
 * The head count is deliberately prominent. "How many people are inside right now" is the
 * question the system exists to answer, and an officer who can see it at a glance will
 * notice when it is wrong — which is the only way a missed exit scan ever gets caught.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { useGateDraft } from '@/context/GateDraftContext';
import { gateAPI, GateEntry } from '@/services/gate.api';

export default function SecurityHomeScreen() {
  const router = useRouter();
  const { user, employeeId, logout, getIdToken } = useAuth();
  const { reset } = useGateDraft();

  const [onCampus, setOnCampus] = useState<GateEntry[]>([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [recent, setRecent] = useState<GateEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const token = await getIdToken();
      const [campusResult, mineResult] = await Promise.all([
        gateAPI.listOnCampus(token),
        gateAPI.listMyEntries(token, 10),
      ]);

      if (campusResult.success && campusResult.data) {
        setOnCampus(campusResult.data.entries);
        setPeopleCount(campusResult.data.peopleOnCampus);
      } else {
        setError(campusResult.message || 'Could not load the on-campus list');
      }

      if (mineResult.success && mineResult.data) {
        setRecent(mineResult.data.entries);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  // Refreshed on focus rather than only on mount: the officer comes back to this screen
  // after every registration and every exit scan, and a stale head count is worse than
  // no head count.
  //
  // While the screen is open it also refreshes every minute, so an overstay shows up on
  // its own instead of waiting for the officer to pull down.
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 60 * 1000);
      return () => clearInterval(timer);
    }, [load])
  );

  const overstays = onCampus.filter((entry) => entry.overstay);

  const handleRegister = () => {
    // Cleared here rather than on the form's mount, so returning from the plate scanner
    // does not wipe what the officer has already typed.
    reset();
    router.push('/(security)/register');
  };

  const handleEndShift = async () => {
    await logout();
    router.replace('/(onboarding)/staff-login');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View style={[styles.card, neuOutset(4, 8, Colors.neuSurface)]}>
          <Text style={styles.badge}>ON SHIFT</Text>
          <Text style={styles.name}>{user?.name || 'Security Officer'}</Text>
          {/*
            The employee ID stays visible for the whole shift: every scan, override and
            flag is attributed to whoever is signed in, so it must never be ambiguous.
          */}
          <Text style={styles.employeeId}>{employeeId}</Text>
        </View>

        <View style={styles.statRow}>
          <View style={[styles.statCard, neuOutset(4, 8, Colors.neuSurface)]}>
            <Text style={styles.statValue}>{peopleCount}</Text>
            <Text style={styles.statLabel}>PEOPLE ON CAMPUS</Text>
          </View>
          <View style={[styles.statCard, neuOutset(4, 8, Colors.neuSurface)]}>
            <Text style={styles.statValue}>{onCampus.length}</Text>
            <Text style={styles.statLabel}>OPEN VISITS</Text>
          </View>
        </View>

        {overstays.length > 0 && (
          <Pressable
            onPress={() => router.push('/(security)/on-campus?filter=overstay' as never)}
            style={styles.overstayBanner}
          >
            <Text style={styles.overstayTitle}>
              ⚠ {overstays.length} {overstays.length === 1 ? 'visitor has' : 'visitors have'} overstayed
            </Text>
            <Text style={styles.overstayBody} numberOfLines={2}>
              {overstays
                .slice(0, 3)
                .map((entry) => entry.visitorName)
                .join(', ')}
              {overstays.length > 3 ? ` and ${overstays.length - 3} more` : ''} — pass expired, not
              signed out. Tap to see who.
            </Text>
          </Pressable>
        )}

        {error && (
          <View style={[styles.errorCard, neuOutset(2, 5, '#FDECEC')]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <NeuButton
          title="Register a visitor"
          variant="accent"
          size="lg"
          fullWidth
          onPress={handleRegister}
        />

        <NeuButton
          title="Verify Approved Permit"
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => router.push('/(security)/permit-verify')}
        />

        <NeuButton
          title="Scan a pass (entry / exit)"
          variant="navy"
          size="md"
          fullWidth
          onPress={() => router.push('/(security)/scan-exit')}
        />

        <Pressable
          onPress={() => router.push('/(security)/on-campus')}
          style={[styles.linkCard, neuOutset(3, 6, Colors.neuSurface)]}
        >
          <Text style={styles.linkTitle}>Who is on campus</Text>
          <Text style={styles.linkSubtitle}>
            Search by pass code, number plate or phone number
          </Text>
        </Pressable>

        {recent.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>REGISTERED BY YOU</Text>

            {recent.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => router.push(`/(security)/pass/${entry.id}` as never)}
                style={[styles.entryRow, neuOutset(3, 6, Colors.neuSurface)]}
              >
                <View style={styles.entryMain}>
                  <Text style={styles.entryName}>{entry.visitorName}</Text>
                  <Text style={styles.entryMeta}>
                    {entry.passCode}
                    {entry.vehicle ? `  ·  ${entry.vehicle.plate}` : ''}
                    {entry.partySize > 1 ? `  ·  party of ${entry.partySize}` : ''}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    entry.status === 'on_campus' ? styles.statusIn : styles.statusOut,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      entry.status === 'on_campus'
                        ? { color: Colors.green600 }
                        : { color: Colors.gray600 },
                    ]}
                  >
                    {entry.status === 'on_campus' ? 'INSIDE' : 'LEFT'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <NeuButton
          title="End shift & sign out"
          variant="danger"
          size="md"
          fullWidth
          onPress={handleEndShift}
          style={styles.endShift}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overstayBanner: {
    backgroundColor: '#FDE4E4',
    borderColor: Colors.red600,
    borderWidth: 2,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: 4,
  },
  overstayTitle: { ...Typography.bodyMd, color: Colors.red600, fontWeight: '900' },
  overstayBody: { ...Typography.caption, color: Colors.gray700, lineHeight: 18 },
  container: { flex: 1, backgroundColor: Colors.neuBackground },
  scroll: { padding: Spacing.lg, paddingTop: Spacing['3xl'], gap: Spacing.md },
  card: { padding: Spacing.lg, borderRadius: Radius.xl, gap: Spacing.xs },
  badge: { ...Typography.tiny, color: Colors.green600, fontWeight: '800', letterSpacing: 1 },
  name: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800' },
  employeeId: { ...Typography.caption, color: Colors.gray600 },

  statRow: { flexDirection: 'row', gap: Spacing.md },
  statCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  statLabel: { ...Typography.tiny, color: Colors.gray600, letterSpacing: 0.5 },

  errorCard: { padding: Spacing.md, borderRadius: Radius.lg },
  errorText: { ...Typography.caption, color: Colors.red600 },

  linkCard: { padding: Spacing.lg, borderRadius: Radius.xl, gap: 2 },
  linkTitle: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '800' },
  linkSubtitle: { ...Typography.caption, color: Colors.gray500 },

  section: { gap: Spacing.sm, marginTop: Spacing.xs },
  sectionTitle: { ...Typography.tiny, color: Colors.gray600, letterSpacing: 0.5 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  entryMain: { flex: 1, gap: 2 },
  entryName: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '700' },
  entryMeta: { ...Typography.tiny, color: Colors.gray500 },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusIn: { backgroundColor: '#E6F6EC' },
  statusOut: { backgroundColor: Colors.gray100 },
  statusText: { ...Typography.tiny, fontWeight: '800', letterSpacing: 0.5 },

  endShift: { marginTop: Spacing.lg },
});
