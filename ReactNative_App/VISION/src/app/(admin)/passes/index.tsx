/**
 * Regular passes — vendors, contractors, drivers and mess staff who come on a schedule.
 * Issued here in advance (up to 180 days) or by security at the gate (up to 30).
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { adminAPI } from '@/services/admin.api';
import { RECURRING_CATEGORY_LABELS } from '@/services/gate.api';
import { useAdminData } from '@/components/admin/useAdminData';
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
} from '@/components/admin/AdminKit';
import { formatDateKey } from '@/utils/istDate';

type StatusFilter = 'active' | 'expired' | 'revoked' | 'all';

export default function RegularPassesScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>('active');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, loading, error, reload } = useAdminData(
    (t) => adminAPI.recurringList(t, { status: status === 'all' ? undefined : status, q: submitted || undefined }),
    [status, submitted]
  );
  const passes = data?.passes ?? [];

  return (
    <AdminPage
      title="Regular passes"
      subtitle="One QR, reused on the days and hours it covers. Scan in, scan out, again tomorrow."
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
      actions={
        <NeuButton title="+ Issue a pass" variant="accent" size="sm" onPress={() => router.push('/(admin)/passes/new' as never)} />
      }
    >
      <Card>
        <Chips
          options={[
            { key: 'active', label: 'Active' },
            { key: 'expired', label: 'Ended' },
            { key: 'revoked', label: 'Revoked' },
            { key: 'all', label: 'All' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <SearchBox
          value={query}
          onChangeText={setQuery}
          onSubmit={() => setSubmitted(query.trim())}
          placeholder="Name, pass code, company, phone or plate — press Enter"
        />
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card title={`${passes.length} PASSES`}>
        {!data && loading ? <Loading /> : null}
        {data && passes.length === 0 ? <Muted>No passes match.</Muted> : null}
        {passes.map((p) => (
          <ListRow
            key={p.id}
            title={`${p.holderName}  ·  ${p.passCode}`}
            lines={[
              `${RECURRING_CATEGORY_LABELS[p.category] ?? p.category}${p.organisation ? ` · ${p.organisation}` : ''}`,
              `${formatDateKey(p.validFrom)} – ${formatDateKey(p.validUntil)} · ${p.schedule}`,
              `Issued by ${p.issuedByEmployeeId ?? '—'} (${p.issuedByRole ?? '—'})${p.linkedAccountLabel ? ` · in account ${p.linkedAccountLabel}` : ''}`,
            ]}
            right={
              <View style={{ alignItems: 'flex-end', gap: Spacing.xs }}>
                <Pill
                  text={p.status.toUpperCase()}
                  tone={p.status === 'active' ? 'good' : p.status === 'revoked' ? 'bad' : 'default'}
                />
                {p.onCampus ? <Pill text="INSIDE" tone="warn" /> : null}
              </View>
            }
            onPress={() => router.push(`/(admin)/passes/${p.id}` as never)}
          />
        ))}
      </Card>
    </AdminPage>
  );
}
