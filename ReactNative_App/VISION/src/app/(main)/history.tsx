/**
 * Visit History Screen — past visits and closed requests
 *
 * Shows visits that are over — signed out at the gate, or whose window has ended — and
 * requests that were rejected or cancelled. Upcoming and pending requests live on the
 * Requests tab.
 *
 * Gate times are the ones security recorded when scanning the permit. A visit whose
 * permit was never scanned shows no times rather than invented ones.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApp } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

const CLOSED = new Set(['rejected', 'cancelled']);

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function HistoryScreen() {
  const router = useRouter();
  const { requests, requestsLoading } = useApp();

  const history = useMemo(() => {
    const now = Date.now();
    return requests
      .filter((r) => {
        if (CLOSED.has(r.status) || r.exitedAt) return true;
        const end = r.visitEndAt ? new Date(r.visitEndAt).getTime() : NaN;
        return Number.isFinite(end) && end < now;
      })
      .sort((a, b) => (b.visitStartAt || b.createdAt).localeCompare(a.visitStartAt || a.createdAt));
  }, [requests]);

  return (
    <View style={styles.container}>
      <NeuHeader title="Visit History" showLogo={false} />

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={requestsLoading} />}
        ListEmptyComponent={
          requestsLoading ? null : (
            <EmptyState
              icon={<Icon name="file-cabinet" size={48} color={Colors.gray400} />}
              title="No past visits yet"
              subtitle="Visits appear here once their time has passed, or if a request is rejected or cancelled."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(main)/requests/${item.id}` as never)}
            style={[styles.historyCard, neuOutset(4, 8, Colors.neuSurface)]}
          >
            <View style={styles.headerRow}>
              <Text style={styles.destination} numberOfLines={1}>
                {item.destination}
              </Text>
              <StatusChip status={item.status as any} />
            </View>

            <Text style={styles.purpose}>{item.purpose}</Text>
            <Text style={styles.date}>
              {item.date} • {item.timeWindow}
            </Text>

            <View style={styles.divider} />

            <View style={styles.stampsRow}>
              <View style={styles.flex}>
                <Text style={styles.stampLabel}>HOST</Text>
                <Text style={styles.stampValue} numberOfLines={1}>
                  {item.targetFacultyName || '—'}
                </Text>
              </View>
              {item.vehiclePlate ? (
                <View style={styles.alignRight}>
                  <Text style={styles.stampLabel}>VEHICLE</Text>
                  <Text style={styles.stampValue}>{item.vehiclePlate}</Text>
                </View>
              ) : null}
            </View>

            {item.checkedInAt ? (
              <Text style={styles.date}>
                At the gate: in {formatTime(item.checkedInAt)}
                {item.exitedAt ? ` · out ${formatTime(item.exitedAt)}` : ' · not signed out'}
              </Text>
            ) : null}

            {item.facultyRemarks && item.status === 'rejected' ? (
              <Text style={styles.remarks}>“{item.facultyRemarks}”</Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing['4xl'],
  },
  historyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  destination: {
    ...Typography.headlineSm,
    fontSize: 17,
    color: Colors.navy900,
    fontWeight: '800',
    flex: 1,
  },
  purpose: {
    ...Typography.bodyMd,
    color: Colors.gray600,
  },
  date: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.gray200,
    marginVertical: Spacing.xs,
  },
  stampsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
  },
  flex: {
    flex: 1,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  stampLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    letterSpacing: 0.5,
  },
  stampValue: {
    ...Typography.bodySm,
    color: Colors.gray900,
    fontWeight: '700',
  },
  remarks: {
    ...Typography.caption,
    color: Colors.gray600,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  emptyIcon: {
    fontSize: 34,
  },
});
