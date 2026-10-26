/**
 * Watchlist (PRD.md FR-TRU-01, FR-ENT-08).
 *
 * Flag a person or vehicle by phone number and/or number plate, with a reason. When they
 * are registered or checked in at any gate, the officer gets a red alert and decides:
 * deny (recorded) or admit with a written reason (recorded and shown on the overview).
 * Adding and clearing flags are both written to the audit log.
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { useAuth } from '@/context/AuthContext';
import { adminAPI, firstError, WatchlistEntry } from '@/services/admin.api';
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
  ReasonModal,
  fmtDateTime,
} from '@/components/admin/AdminKit';

export default function WatchlistScreen() {
  const { getIdToken } = useAuth();
  const [show, setShow] = useState<'active' | 'all'>('active');
  const { data, loading, error, reload } = useAdminData((t) => adminAPI.watchlist(t, show === 'active'), [show]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', plate: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clearing, setClearing] = useState<WatchlistEntry | null>(null);

  const add = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const result = await adminAPI.addWatchlist(await getIdToken(), {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        plate: form.plate.trim() || undefined,
        reason: form.reason.trim(),
      });
      if (!result.success) throw new Error(firstError(result));
      setForm({ name: '', phone: '', plate: '', reason: '' });
      setAdding(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the flag');
    } finally {
      setSaving(false);
    }
  };

  const entries = data?.entries ?? [];

  return (
    <AdminPage
      title="Watchlist"
      subtitle="People and vehicles the gate should stop and check. Officers see the reason."
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
      actions={
        <NeuButton
          title={adding ? 'Close' : '+ Add flag'}
          variant={adding ? 'ghost' : 'danger'}
          size="sm"
          onPress={() => setAdding(!adding)}
        />
      }
    >
      {adding && (
        <Card title="NEW WATCHLIST FLAG">
          <NeuInput label="NAME *" value={form.name} autoCapitalize="words" onChangeText={(v) => setForm({ ...form, name: v })} />
          <NeuInput label="MOBILE NUMBER" value={form.phone} keyboardType="phone-pad" onChangeText={(v) => setForm({ ...form, phone: v })} placeholder="Matched at the gate" />
          <NeuInput label="NUMBER PLATE" value={form.plate} autoCapitalize="characters" onChangeText={(v) => setForm({ ...form, plate: v })} placeholder="Matched at the gate" />
          <NeuInput
            label="REASON *"
            value={form.reason}
            onChangeText={(v) => setForm({ ...form, reason: v })}
            placeholder="What happened, and when — the officer reads this at the gate"
            multiline
          />
          <Muted>A phone number or a number plate is required: those are what the gate matches on.</Muted>
          <ErrorText>{formError}</ErrorText>
          <NeuButton
            title="Add to watchlist"
            variant="danger"
            size="md"
            loading={saving}
            disabled={form.name.trim().length < 2 || form.reason.trim().length < 5 || (!form.phone.trim() && !form.plate.trim())}
            onPress={add}
          />
        </Card>
      )}

      <Card>
        <Chips
          options={[
            { key: 'active', label: 'Active flags' },
            { key: 'all', label: 'All, including cleared' },
          ]}
          value={show}
          onChange={setShow}
        />
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card title={`${entries.length} FLAGS`}>
        {!data && loading ? <Loading /> : null}
        {data && entries.length === 0 ? <Muted>No flags.</Muted> : null}
        {entries.map((w) => (
          <ListRow
            key={w.id}
            tone={w.active ? 'alert' : undefined}
            title={w.name}
            lines={[
              [w.phone && `Phone ${w.phone}`, w.plate && `Plate ${w.plate}`, w.userUid && 'VISION account'].filter(Boolean).join(' · '),
              w.reason,
              `Added ${fmtDateTime(w.addedAt)} by ${w.addedByEmployeeId ?? '—'}`,
              !w.active ? `Cleared ${fmtDateTime(w.clearedAt)} by ${w.clearedByEmployeeId ?? '—'}: ${w.clearReason ?? ''}` : null,
            ]}
            right={
              <View style={styles.actions}>
                <Pill text={w.active ? 'ACTIVE' : 'CLEARED'} tone={w.active ? 'bad' : 'default'} />
                {w.active ? <NeuButton title="Clear" variant="ghost" size="sm" onPress={() => setClearing(w)} /> : null}
              </View>
            }
          />
        ))}
      </Card>

      <ReasonModal
        visible={Boolean(clearing)}
        title={`Clear the flag on ${clearing?.name ?? ''}?`}
        message="The gate will stop alerting on them. The flag stays in history, with your reason."
        confirmLabel="Clear flag"
        onCancel={() => setClearing(null)}
        onConfirm={async (reason) => {
          const current = clearing;
          if (!current) return;
          const result = await adminAPI.clearWatchlist(await getIdToken(), current.id, reason);
          if (!result.success) throw new Error(firstError(result));
          setClearing(null);
          await reload();
        }}
      />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: 'flex-end', gap: Spacing.xs },
});
