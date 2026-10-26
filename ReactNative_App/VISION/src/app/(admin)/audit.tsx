/**
 * Audit log (PRD.md FR-ADM-05) — every consequential staff action, newest first: accounts
 * created, reset, deactivated and suspended; watchlist flags added and cleared; admissions
 * on override and denials; regular passes issued and revoked; passes sent to accounts; ID
 * photos viewed; reports downloaded. Read-only: nothing in the system edits or deletes a row.
 */

import React, { useState } from 'react';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { adminAPI, AuditRow, firstError } from '@/services/admin.api';
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
  fmtDateTime,
} from '@/components/admin/AdminKit';

type Filter = 'all' | 'staff' | 'user' | 'watchlist' | 'gate' | 'pass' | 'record' | 'report';

const TONE: Record<string, 'bad' | 'warn' | 'good' | 'default'> = {
  'gate.watchlist_override': 'bad',
  'gate.watchlist_denied': 'warn',
  'user.suspend': 'bad',
  'staff.deactivate': 'bad',
  'watchlist.add': 'warn',
  'record.id_photo_view': 'warn',
  'pass.recurring_revoke': 'bad',
};

export default function AuditScreen() {
  const { getIdToken } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const { data, loading, error, reload } = useAdminData((t) => adminAPI.audit(t), []);
  const [older, setOlder] = useState<AuditRow[]>([]);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const rows = [...(data?.rows ?? []), ...older].filter((r) => filter === 'all' || r.action.startsWith(`${filter}.`));

  const loadMore = async () => {
    const all = [...(data?.rows ?? []), ...older];
    const last = all[all.length - 1];
    if (!last?.at) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await adminAPI.audit(await getIdToken(), last.at);
      if (!result.success || !result.data) throw new Error(firstError(result));
      setOlder((o) => [...o, ...result.data!.rows]);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <AdminPage
      title="Audit log"
      subtitle="Who did what, and when. Append-only."
      refreshing={loading && Boolean(data)}
      onRefresh={() => {
        setOlder([]);
        void reload();
      }}
    >
      <Card>
        <Chips
          options={[
            { key: 'all', label: 'All' },
            { key: 'gate', label: 'Gate overrides & denials' },
            { key: 'watchlist', label: 'Watchlist' },
            { key: 'pass', label: 'Passes' },
            { key: 'staff', label: 'Staff' },
            { key: 'user', label: 'Visitor accounts' },
            { key: 'record', label: 'ID photo views' },
            { key: 'report', label: 'Reports' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card title={`${rows.length} ENTRIES`}>
        {!data && loading ? <Loading /> : null}
        {data && rows.length === 0 ? <Muted>Nothing recorded yet.</Muted> : null}
        {rows.map((r) => (
          <ListRow
            key={r.id}
            title={r.summary}
            lines={[`${fmtDateTime(r.at)} · ${r.actorEmployeeId ?? 'unknown'} (${r.actorRole ?? '—'})`]}
            right={<Pill text={r.action} tone={TONE[r.action] ?? 'default'} />}
          />
        ))}
        <ErrorText>{moreError}</ErrorText>
        {data && (data.rows.length >= 100 || older.length > 0) ? (
          <NeuButton title="Load older entries" variant="ghost" size="sm" loading={loadingMore} onPress={loadMore} />
        ) : null}
      </Card>
    </AdminPage>
  );
}
