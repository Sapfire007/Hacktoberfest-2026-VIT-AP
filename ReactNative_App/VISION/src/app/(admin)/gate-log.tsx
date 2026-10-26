/**
 * Entry / exit log — who came in, who went out, and who was turned away, with the gate,
 * the time and the officer. One row per event, newest first; exportable as CSV.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { adminAPI, openReport } from '@/services/admin.api';
import { GATES } from '@/constants/gate';
import { useAdminData } from '@/components/admin/useAdminData';
import { DateRangeBar, todayRange } from '@/components/admin/DateRangeBar';
import {
  AdminPage,
  Card,
  Chips,
  ErrorText,
  ListRow,
  Loading,
  Muted,
  Pill,
  SearchBox,
  fmtDateTime,
} from '@/components/admin/AdminKit';

type TypeFilter = 'all' | 'entry' | 'exit' | 'denied';

const TYPE_PILL = {
  entry: { text: 'IN', tone: 'good' as const },
  exit: { text: 'OUT', tone: 'default' as const },
  denied: { text: 'DENIED', tone: 'bad' as const },
};
const SOURCE_LABEL: Record<string, string> = { walkin: 'walk-in', permit: 'permit', recurring: 'regular pass' };

export default function GateLogScreen() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [range, setRange] = useState(todayRange());
  const [type, setType] = useState<TypeFilter>('all');
  const [gate, setGate] = useState('all');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, loading, error, reload } = useAdminData(
    (t) =>
      adminAPI.events(t, {
        ...range,
        type: type === 'all' ? undefined : type,
        gate: gate === 'all' ? undefined : gate,
        q: submittedQuery || undefined,
      }),
    [range.from, range.to, type, gate, submittedQuery],
    { refreshMs: 30000 }
  );

  const events = data?.events ?? [];
  const counts = {
    in: events.filter((e) => e.type === 'entry').length,
    out: events.filter((e) => e.type === 'exit').length,
    denied: events.filter((e) => e.type === 'denied').length,
  };

  const exportCsv = async () => {
    setExportError(null);
    setExporting(true);
    try {
      await openReport(await getIdToken(), 'log-csv', range.from, range.to);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminPage
      title="Entry / exit log"
      subtitle="Every scan at every gate: who, when, where, and which officer."
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
      actions={<NeuButton title="Export CSV" variant="primary" size="sm" loading={exporting} onPress={exportCsv} />}
    >
      <Card>
        <DateRangeBar value={range} onChange={setRange} />
        <Chips
          options={[
            { key: 'all', label: 'All' },
            { key: 'entry', label: 'Entries' },
            { key: 'exit', label: 'Exits' },
            { key: 'denied', label: 'Denied' },
          ]}
          value={type}
          onChange={setType}
        />
        <Chips
          options={[{ key: 'all', label: 'All gates' }, ...GATES.map((g) => ({ key: g, label: g }))]}
          value={gate}
          onChange={setGate}
        />
        <SearchBox
          value={query}
          onChangeText={setQuery}
          onSubmit={() => setSubmittedQuery(query.trim())}
          placeholder="Search name, pass code, phone, plate or officer — press Enter"
        />
        <ErrorText>{exportError}</ErrorText>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card
        title={`${events.length} EVENTS`}
        right={<Text style={styles.counts}>{counts.in} in · {counts.out} out · {counts.denied} denied</Text>}
      >
        {!data && loading ? <Loading /> : null}
        {data && events.length === 0 ? <Muted>No gate activity matches these filters.</Muted> : null}
        {events.map((e) => (
          <ListRow
            key={e.id}
            tone={e.flagged ? 'alert' : undefined}
            title={`${e.visitorName}${e.partySize > 1 ? ` (+${e.partySize - 1})` : ''}`}
            lines={[
              `${fmtDateTime(e.at)} · ${e.gate ?? 'gate not recorded'} · officer ${e.officerEmployeeId}`,
              [e.passCode, e.plate, e.phone, e.source ? SOURCE_LABEL[e.source] : null].filter(Boolean).join('  ·  '),
              e.note,
            ]}
            right={
              <View style={styles.right}>
                <Pill text={TYPE_PILL[e.type].text} tone={TYPE_PILL[e.type].tone} />
                {e.flagged ? <Pill text="WATCHLIST" tone="bad" /> : null}
              </View>
            }
            onPress={e.entryId ? () => router.push(`/(admin)/entries/${e.entryId}` as never) : undefined}
          />
        ))}
      </Card>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  counts: { ...Typography.caption, color: Colors.gray600, fontWeight: '700' },
  right: { alignItems: 'flex-end', gap: Spacing.xs },
});
