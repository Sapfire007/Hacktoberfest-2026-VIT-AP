/**
 * Visitor accounts (PRD.md FR-ADM-01) — the self-registered visitors, parents and students.
 *
 * Admin can see who has an account and suspend or reactivate it. Suspending disables the
 * sign-in and ends current sessions on the next request. The list never includes ID
 * documents, biometrics or profile photos — only whether they were provided.
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { adminAPI, firstError, RequesterAccount } from '@/services/admin.api';
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
  SearchBox,
  fmtDateTime,
} from '@/components/admin/AdminKit';

type StatusFilter = 'all' | 'active' | 'suspended';

export default function UsersScreen() {
  const { getIdToken } = useAuth();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [target, setTarget] = useState<{ user: RequesterAccount; suspend: boolean } | null>(null);

  const { data, loading, error, reload } = useAdminData(
    (t) => adminAPI.users(t, { q: submitted || undefined, status: status === 'all' ? undefined : status }),
    [submitted, status]
  );
  const users = data?.users ?? [];

  return (
    <AdminPage
      title="Visitor accounts"
      subtitle="Visitors, parents and students who signed up in the app. Staff are on the Staff screen."
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
    >
      <Card>
        <Chips
          options={[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'suspended', label: 'Suspended' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <SearchBox
          value={query}
          onChangeText={setQuery}
          onSubmit={() => setSubmitted(query.trim())}
          placeholder="Name, email or phone — press Enter"
        />
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card title={`${users.length} ACCOUNTS`}>
        {!data && loading ? <Loading /> : null}
        {data && users.length === 0 ? <Muted>No accounts match.</Muted> : null}
        {users.map((u) => (
          <ListRow
            key={u.uid}
            tone={u.status === 'suspended' ? 'alert' : undefined}
            title={u.name || u.email}
            lines={[
              `${u.email}${u.phone ? ` · ${u.phone}` : ''}`,
              `${u.role}${u.visitorSubtype ? ` (${u.visitorSubtype.replace(/_/g, ' ')})` : ''} · joined ${fmtDateTime(u.createdAt)}`,
              [
                u.emailVerified ? 'email verified' : 'email NOT verified',
                u.govtIdUploaded ? 'ID uploaded' : 'no ID',
                u.biometricEnrolled ? 'face enrolled' : 'no face enrolment',
              ].join(' · '),
              u.suspendedReason ? `Suspended: ${u.suspendedReason}` : null,
            ]}
            right={
              <View style={styles.actions}>
                <Pill text={u.status.toUpperCase()} tone={u.status === 'suspended' ? 'bad' : 'good'} />
                {u.status === 'suspended' ? (
                  <NeuButton title="Reactivate" variant="primary" size="sm" onPress={() => setTarget({ user: u, suspend: false })} />
                ) : (
                  <NeuButton title="Suspend" variant="danger" size="sm" onPress={() => setTarget({ user: u, suspend: true })} />
                )}
              </View>
            }
          />
        ))}
      </Card>

      <ReasonModal
        visible={Boolean(target)}
        title={target?.suspend ? `Suspend ${target.user.name || target.user.email}?` : `Reactivate ${target?.user.name || target?.user.email}?`}
        message={
          target?.suspend
            ? 'They are signed out on their next action and cannot sign in or submit visit requests until reactivated. Recorded in the audit log.'
            : 'They can sign in again. Recorded in the audit log.'
        }
        confirmLabel={target?.suspend ? 'Suspend' : 'Reactivate'}
        danger={target?.suspend}
        optional={!target?.suspend}
        onCancel={() => setTarget(null)}
        onConfirm={async (reason) => {
          const current = target;
          if (!current) return;
          const token = await getIdToken();
          const result = current.suspend
            ? await adminAPI.suspendUser(token, current.user.uid, reason)
            : await adminAPI.reactivateUser(token, current.user.uid, reason);
          if (!result.success) throw new Error(firstError(result));
          setTarget(null);
          await reload();
        }}
      />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: 'flex-end', gap: Spacing.xs },
});
