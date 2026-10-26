/**
 * Gate records — one row per visit, for a date range: walk-ins, permit check-ins and
 * regular-pass days. Filter by status (inside, left, overstayed) and how they got in.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Spacing } from '@/constants/neumorphic';
import { adminAPI } from '@/services/admin.api';
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
  fmtMinutes,
} from '@/components/admin/AdminKit';

type StatusFilter = 'all' | 'on_campus' | 'exited' | 'overstay';
type SourceFilter = 'all' | 'walkin' | 'permit' | 'recurring';

export default function GateRecordsScreen() {
  const router = useRouter();
  const [range, setRange] = useState(todayRange());
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, loading, error, reload } = useAdminData(
    (t) =>
      adminAPI.entries(t, {
        ...range,
        status: status === 'all' ? undefined : status,
        source: source === 'all' ? undefined : source,
        q: submitted || undefined,
      }),
    [range.from, range.to, status, source, submitted]
  );
  const entries = data?.entries ?? [];

  return (
    <AdminPage
      title="Gate records"
      subtitle="Each visit, with who registered it and who signed it out."
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
    >
      <Card>
        <DateRangeBar value={range} onChange={setRange} />
        <Chips
          options={[
            { key: 'all', label: 'All' },
            { key: 'on_campus', label: 'Inside' },
            { key: 'exited', label: 'Left' },
            { key: 'overstay', label: 'Overstayed' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <Chips
          options={[
            { key: 'all', label: 'Any type' },
            { key: 'walkin', label: 'Walk-in' },
            { key: 'permit', label: 'Permit' },
            { key: 'recurring', label: 'Regular pass' },
          ]}
          value={source}
          onChange={setSource}
        />
        <SearchBox
          value={query}
          onChangeText={setQuery}
          onSubmit={() => setSubmitted(query.trim())}
          placeholder="Name, pass code, phone or plate — press Enter"
        />
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card title={`${entries.length} RECORDS`}>
        {!data && loading ? <Loading /> : null}
        {data && entries.length === 0 ? <Muted>No visits match.</Muted> : null}
        {entries.map((e) => (
          <ListRow
            key={e.id}
            tone={e.overstay ? 'alert' : undefined}
            title={`${e.visitorName}${e.partySize > 1 ? ` (+${e.partySize - 1})` : ''}  ·  ${e.passCode}`}
            lines={[
              `In ${fmtDateTime(e.entryAt)} (${e.registeredByEmployeeId})` +
                (e.exitAt ? ` · out ${fmtDateTime(e.exitAt)} (${e.exitedByEmployeeId ?? '—'})` : ''),
              [e.hostName, e.purpose].filter(Boolean).join(' — '),
              [e.phone, e.vehicle?.plate, e.gate].filter(Boolean).join('  ·  '),
              e.overstay ? `Overstayed ${fmtMinutes(e.overstayMinutes ?? 0)}` : null,
            ]}
            right={
              <View style={{ alignItems: 'flex-end', gap: Spacing.xs }}>
                <Pill
                  text={e.status === 'on_campus' ? (e.overstay ? 'OVERSTAY' : 'INSIDE') : 'LEFT'}
                  tone={e.status === 'on_campus' ? (e.overstay ? 'bad' : 'good') : 'default'}
                />
                {e.source && e.source !== 'walkin' ? (
                  <Pill text={e.source === 'permit' ? 'PERMIT' : 'REGULAR'} tone="warn" />
                ) : null}
                {e.watchlistOverride ? <Pill text="OVERRIDE" tone="bad" /> : null}
              </View>
            }
            onPress={() => router.push(`/(admin)/entries/${e.id}` as never)}
          />
        ))}
      </Card>
    </AdminPage>
  );
}
