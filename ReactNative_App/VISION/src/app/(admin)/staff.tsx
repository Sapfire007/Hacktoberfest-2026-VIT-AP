/**
 * Staff accounts (Design.md §5.7 "Staff Provisioning", PRD.md FR-ADM-06/07/08).
 *
 * The only way a faculty, security or admin account comes into existence. The admin sets
 * an initial password and hands it over in person; the holder must change it at first
 * sign-in. Deactivating takes effect on the holder's next request. An admin cannot
 * deactivate their own account, and the last active admin cannot be deactivated at all.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { useAuth } from '@/context/AuthContext';
import { adminAPI, firstError, StaffAccount } from '@/services/admin.api';
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

type RoleFilter = 'all' | 'faculty' | 'security' | 'admin';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function StaffScreen() {
  const { getIdToken, employeeId: myEmployeeId } = useAuth();
  const { data, loading, error, reload } = useAdminData((t) => adminAPI.staff(t), []);
  const [role, setRole] = useState<RoleFilter>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<StaffAccount | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [form, setForm] = useState({
    employeeId: '',
    displayName: '',
    role: 'security' as 'faculty' | 'security' | 'admin',
    department: '',
    email: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  const staff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.staff ?? [])
      .filter((s) => role === 'all' || s.role === role)
      .filter(
        (s) =>
          !q ||
          s.displayName.toLowerCase().includes(q) ||
          s.employeeId.toLowerCase().includes(q) ||
          (s.department ?? '').toLowerCase().includes(q)
      );
  }, [data, role, query]);

  const create = async () => {
    setActionError(null);
    setSaving(true);
    try {
      const result = await adminAPI.createStaff(await getIdToken(), {
        employeeId: form.employeeId.trim(),
        displayName: form.displayName.trim(),
        role: form.role,
        password: form.password,
        department: form.department.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      if (!result.success) throw new Error(firstError(result));
      notify(
        'Account created',
        `${form.employeeId.toUpperCase()} can now sign in with the password you set. Hand it over in person — they must change it at first sign-in.`
      );
      setForm({ employeeId: '', displayName: '', role: form.role, department: '', email: '', password: '' });
      setCreating(false);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create the account');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (account: StaffAccount, active: boolean) => {
    setActionError(null);
    const result = await adminAPI.setStaffActive(await getIdToken(), account.employeeId, active);
    if (!result.success) {
      setActionError(firstError(result));
      return;
    }
    await reload();
  };

  const confirmDeactivate = (account: StaffAccount) => {
    const message = `${account.displayName} (${account.employeeId}) loses access on their next action — gate scanning, approvals, the console. The account and its history are kept, and the employee ID is never reissued.`;
    if (Platform.OS === 'web') {
      if (window.confirm(`Deactivate this account?\n\n${message}`)) void setActive(account, false);
      return;
    }
    Alert.alert('Deactivate this account?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => void setActive(account, false) },
    ]);
  };

  return (
    <AdminPage
      title="Staff"
      subtitle="Faculty, security and admin accounts. Nobody in these roles can sign up — they are created here."
      refreshing={loading && Boolean(data)}
      onRefresh={reload}
      actions={
        <NeuButton
          title={creating ? 'Close' : '+ New account'}
          variant={creating ? 'ghost' : 'accent'}
          size="sm"
          onPress={() => setCreating(!creating)}
        />
      }
    >
      <ErrorText>{actionError}</ErrorText>

      {creating && (
        <Card title="NEW STAFF ACCOUNT">
          <NeuInput label="EMPLOYEE ID *" value={form.employeeId} autoCapitalize="characters" onChangeText={(v) => setForm({ ...form, employeeId: v })} placeholder="e.g. VITAP-SEC07" />
          <NeuInput label="FULL NAME *" value={form.displayName} autoCapitalize="words" onChangeText={(v) => setForm({ ...form, displayName: v })} />
          <Text style={styles.label}>ROLE *</Text>
          <Chips
            options={[
              { key: 'security', label: 'Security' },
              { key: 'faculty', label: 'Faculty' },
              { key: 'admin', label: 'Admin' },
            ]}
            value={form.role}
            onChange={(r) => setForm({ ...form, role: r })}
          />
          <NeuInput label="DEPARTMENT" value={form.department} onChangeText={(v) => setForm({ ...form, department: v })} />
          <NeuInput label="EMAIL" value={form.email} autoCapitalize="none" keyboardType="email-address" onChangeText={(v) => setForm({ ...form, email: v })} />
          <NeuInput label="INITIAL PASSWORD * (8+ characters)" value={form.password} secureTextEntry autoCapitalize="none" onChangeText={(v) => setForm({ ...form, password: v })} />
          <Muted>
            The holder must change this password at first sign-in. It is never emailed: an employee ID
            has no verified address to send it to.
          </Muted>
          <NeuButton
            title="Create account"
            variant="accent"
            size="md"
            loading={saving}
            disabled={!form.employeeId.trim() || !form.displayName.trim() || form.password.length < 8}
            onPress={create}
          />
        </Card>
      )}

      <Card>
        <Chips
          options={[
            { key: 'all', label: 'All' },
            { key: 'security', label: 'Security' },
            { key: 'faculty', label: 'Faculty' },
            { key: 'admin', label: 'Admin' },
          ]}
          value={role}
          onChange={setRole}
        />
        <SearchBox value={query} onChangeText={setQuery} placeholder="Search name, employee ID or department" />
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card title={`${staff.length} ACCOUNTS`}>
        {!data && loading ? <Loading /> : null}
        {data && staff.length === 0 ? <Muted>No accounts match.</Muted> : null}
        {staff.map((s) => {
          const isMe = s.employeeId.toUpperCase() === (myEmployeeId ?? '').toUpperCase();
          return (
            <ListRow
              key={s.employeeId}
              title={`${s.displayName}${isMe ? ' (you)' : ''}`}
              lines={[
                `${s.employeeId} · ${s.role}${s.department ? ` · ${s.department}` : ''}`,
                `Last sign-in ${s.lastLoginAt ? fmtDateTime(s.lastLoginAt) : 'never'}${s.mustChangePassword ? ' · must change password' : ''}`,
              ]}
              right={
                <View style={styles.rowActions}>
                  <Pill text={s.active ? 'ACTIVE' : 'DEACTIVATED'} tone={s.active ? 'good' : 'bad'} />
                  <NeuButton title="Reset password" variant="ghost" size="sm" onPress={() => setResetting(s)} />
                  {s.active ? (
                    !isMe && <NeuButton title="Deactivate" variant="danger" size="sm" onPress={() => confirmDeactivate(s)} />
                  ) : (
                    <NeuButton title="Reactivate" variant="primary" size="sm" onPress={() => void setActive(s, true)} />
                  )}
                </View>
              }
            />
          );
        })}
      </Card>

      <ReasonModal
        visible={Boolean(resetting)}
        title={`Reset password — ${resetting?.employeeId ?? ''}`}
        message="Set a new initial password and hand it over in person. They must change it at next sign-in."
        placeholder="New password (8+ characters)"
        secret
        minLength={8}
        confirmLabel="Reset password"
        onCancel={() => setResetting(null)}
        onConfirm={async (password) => {
          const current = resetting;
          if (!current) return;
          const result = await adminAPI.resetStaffPassword(await getIdToken(), current.employeeId, password);
          if (!result.success) throw new Error(firstError(result));
          notify('Password reset', `${current.employeeId} must change it at next sign-in.`);
          setResetting(null);
          await reload();
        }}
      />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  label: { ...Typography.tiny, color: Colors.gray600, fontWeight: '700', letterSpacing: 0.5 },
  rowActions: { alignItems: 'flex-end', gap: Spacing.xs },
});
