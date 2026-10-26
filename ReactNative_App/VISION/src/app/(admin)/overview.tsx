/**
 * Admin overview — the live picture of the gate (Design.md §5.7 "Overview").
 *
 * Who is inside right now, today's entries, exits and denials, anyone who has overstayed,
 * and the latest security alerts. Refreshes every 20 seconds while open. On a phone it is
 * also the console's menu.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { adminAPI } from '@/services/admin.api';
import { ADMIN_NAV } from '@/components/admin/nav';
import { useAdminData } from '@/components/admin/useAdminData';
import {
  AdminPage,
  Card,
  ErrorText,
  Grid,
  ListRow,
  Loading,
  Muted,
  Pill,
  StatTile,
  fmtDateTime,
  fmtMinutes,
  useIsWide,
} from '@/components/admin/AdminKit';

const ALERT_LABEL: Record<string, { text: string; tone: 'bad' | 'warn' }> = {
  watchlist_hit: { text: 'WATCHLIST MATCH', tone: 'warn' },
  watchlist_override: { text: 'ADMITTED ON OVERRIDE', tone: 'bad' },
  watchlist_denied: { text: 'DENIED', tone: 'warn' },
};

export default function AdminOverviewScreen() {
  const router = useRouter();
  const wide = useIsWide();
  const { user, employeeId, logout } = useAuth();
  const { data, loading, error, reload } = useAdminData((t) => adminAPI.overview(t), [], {
    refreshMs: 20000,
  });

  const signOut = async () => {
    await logout();
    router.replace('/(onboarding)/staff-login');
  };

  return (
    <AdminPage
      title="Overview"
      subtitle={`Signed in as ${user?.name || 'Administrator'} (${employeeId ?? '—'}) · live, refreshes every 20 s`}
      isHub
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
    >
      <ErrorText>{error}</ErrorText>
      {!data && loading ? <Loading /> : null}

      {data && (
        <>
          <Grid min={200}>
            <StatTile label="PEOPLE ON CAMPUS" value={data.onCampus.people} hint={`${data.onCampus.visits} open visits`} />
            <StatTile label="ENTRIES TODAY" value={data.today.entries} hint={`${data.today.people} people`} onPress={() => router.push('/(admin)/gate-log' as never)} />
            <StatTile label="EXITS TODAY" value={data.today.exits} onPress={() => router.push('/(admin)/gate-log' as never)} />
            <StatTile
              label="OVERSTAYED"
              value={data.overstays.length}
              tone={data.overstays.length ? 'alert' : 'good'}
              hint="pass expired, still inside"
            />
            <StatTile label="DENIED TODAY" value={data.today.denials} tone={data.today.denials ? 'alert' : 'default'} />
            <StatTile label="ACTIVE REGULAR PASSES" value={data.activeRegularPasses} onPress={() => router.push('/(admin)/passes' as never)} />
            <StatTile label="PENDING VISIT REQUESTS" value={data.pendingVisitRequests} hint="awaiting faculty" />
          </Grid>

          <View style={[styles.columns, wide && styles.columnsWide]}>
            <Card title="OVERSTAYS" style={styles.column}>
              {data.overstays.length === 0 ? (
                <Muted>Nobody is inside past the end of their pass.</Muted>
              ) : (
                data.overstays.map((e) => (
                  <ListRow
                    key={e.id}
                    tone="alert"
                    title={`${e.visitorName}  ·  ${e.passCode}`}
                    lines={[
                      `Overstayed ${fmtMinutes(e.overstayMinutes ?? 0)} · pass ended ${fmtDateTime(e.expiresAt)}`,
                      `${e.phone}${e.vehicle ? ` · ${e.vehicle.plate}` : ''}${e.gate ? ` · in via ${e.gate}` : ''}`,
                      e.hostName ? `Visiting ${e.hostName}` : e.purpose,
                    ]}
                    onPress={() => router.push(`/(admin)/entries/${e.id}` as never)}
                  />
                ))
              )}
            </Card>

            <Card title="RECENT SECURITY ALERTS" style={styles.column}>
              {data.alerts.length === 0 ? (
                <Muted>No watchlist alerts yet.</Muted>
              ) : (
                data.alerts.map((a) => (
                  <ListRow
                    key={a.id}
                    title={a.visitorName}
                    lines={[
                      a.matches.map((m) => `${m.name}: ${m.reason}`).join('; ') || null,
                      a.reason ? `Officer: “${a.reason}”` : null,
                      `${fmtDateTime(a.at)} · ${a.officerEmployeeId}${a.gate ? ` · ${a.gate}` : ''}`,
                    ]}
                    right={<Pill text={ALERT_LABEL[a.type]?.text ?? a.type} tone={ALERT_LABEL[a.type]?.tone ?? 'warn'} />}
                    onPress={a.entryId ? () => router.push(`/(admin)/entries/${a.entryId}` as never) : undefined}
                  />
                ))
              )}
            </Card>
          </View>
        </>
      )}

      {!wide && (
        <>
          <Text style={styles.menuTitle}>CONSOLE</Text>
          {ADMIN_NAV.filter((item) => item.match !== 'overview').map((item) => (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href as never)}
              style={[styles.menuItem, neuOutset(3, 6, Colors.neuSurface)]}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuBlurb}>{item.blurb}</Text>
              </View>
              <Text style={styles.menuChevron}>›</Text>
            </Pressable>
          ))}
          <NeuButton title="Sign out" variant="danger" size="md" fullWidth onPress={signOut} />
        </>
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  columns: { gap: Spacing.md },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1 },
  menuTitle: { ...Typography.tiny, color: Colors.gray600, fontWeight: '800', letterSpacing: 0.6, marginTop: Spacing.md },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  menuIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  menuLabel: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '800' },
  menuBlurb: { ...Typography.caption, color: Colors.gray500 },
  menuChevron: { fontSize: 24, color: Colors.gray400 },
});
