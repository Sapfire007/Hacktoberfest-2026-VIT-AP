/**
 * Issue a regular pass in advance — for a vendor's delivery driver, a contractor's crew
 * member, mess staff. Up to 180 days. An ID photo is optional here (the holder may not be
 * present); the document type and last four characters are recorded either way.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { NeuDropdown } from '@/components/ui/NeuDropdown';
import { NativeDateTimePicker } from '@/components/ui/NativeDateTimePicker';
import { WatchlistAlert } from '@/components/gate/WatchlistAlert';
import { useAuth } from '@/context/AuthContext';
import { adminAPI, firstError } from '@/services/admin.api';
import { RECURRING_CATEGORY_LABELS, RecurringCategory, WatchlistMatch } from '@/services/gate.api';
import { ID_TYPES } from '@/constants/gate';
import { AdminPage, Card, Chips, ErrorText, Muted } from '@/components/admin/AdminKit';
import { WEEKDAY_SHORT, addDaysKey, daysBetweenInclusive, istToday, toHHMM } from '@/utils/istDate';

const MAX_DAYS = 180;

const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dateToKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const timeToDate = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

export default function IssueRegularPassScreen() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const today = istToday();

  const [form, setForm] = useState({
    holderName: '',
    phone: '',
    email: '',
    category: 'vendor' as RecurringCategory,
    organisation: '',
    purpose: '',
    hostName: '',
    vehiclePlate: '',
    idType: '',
    idLastFour: '',
    validFrom: today,
    validUntil: addDaysKey(today, 29),
    weekdays: [1, 2, 3, 4, 5, 6],
    dailyStart: '07:00',
    dailyEnd: '19:00',
    notes: '',
  });
  const [idPhoto, setIdPhoto] = useState<{ dataUri: string; uri: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<WatchlistMatch[] | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const days = daysBetweenInclusive(form.validFrom, form.validUntil);

  const pickPhoto = async () => {
    const result =
      Platform.OS === 'web'
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, base64: true, allowsEditing: true });
    const asset = result.canceled ? null : result.assets?.[0];
    if (asset?.base64) setIdPhoto({ dataUri: `data:image/jpeg;base64,${asset.base64}`, uri: asset.uri });
  };

  const issue = async (overrideReason?: string) => {
    setError(null);
    setWatchlistError(null);
    setSaving(true);
    try {
      const result = await adminAPI.issueRecurring(await getIdToken(), {
        holderName: form.holderName.trim(),
        phone: form.phone,
        email: form.email.trim() || undefined,
        category: form.category,
        organisation: form.organisation.trim() || undefined,
        purpose: form.purpose.trim(),
        hostName: form.hostName.trim() || undefined,
        vehiclePlate: form.vehiclePlate.trim() || undefined,
        idType: form.idType,
        idLastFour: form.idLastFour.trim() || undefined,
        idImageDataUri: idPhoto?.dataUri,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        weekdays: form.weekdays,
        dailyStart: form.dailyStart,
        dailyEnd: form.dailyEnd,
        notes: form.notes.trim() || undefined,
        watchlistOverride: overrideReason ? { reason: overrideReason } : undefined,
      });
      if (result.error === 'watchlist_hit') {
        setMatches(result.data?.matches ?? []);
        if (overrideReason) setWatchlistError(result.message || null);
        return;
      }
      if (!result.success || !result.data) throw new Error(firstError(result));
      router.replace(`/(admin)/passes/${result.data.pass.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue the pass');
    } finally {
      setSaving(false);
    }
  };

  const ready =
    form.holderName.trim().length >= 2 &&
    form.phone.replace(/\D/g, '').length >= 10 &&
    form.purpose.trim().length >= 2 &&
    form.idType &&
    form.weekdays.length > 0 &&
    days >= 1 &&
    days <= MAX_DAYS;

  return (
    <AdminPage title="Issue a regular pass" subtitle={`For people who come on a schedule. Up to ${MAX_DAYS} days.`}>
      <Card title="HOLDER">
        <NeuInput label="FULL NAME *" value={form.holderName} autoCapitalize="words" onChangeText={(v) => set({ holderName: v })} placeholder="As printed on the ID" />
        <NeuInput label="MOBILE NUMBER *" value={form.phone} keyboardType="phone-pad" onChangeText={(v) => set({ phone: v.replace(/[^\d+ ]/g, '') })} />
        <NeuInput label="EMAIL" value={form.email} autoCapitalize="none" keyboardType="email-address" onChangeText={(v) => set({ email: v.trim() })} placeholder="Optional — sends the pass to their VISION account" />
        <Text style={styles.label}>WHO THEY ARE</Text>
        <Chips
          options={(Object.keys(RECURRING_CATEGORY_LABELS) as RecurringCategory[]).map((key) => ({ key, label: RECURRING_CATEGORY_LABELS[key] }))}
          value={form.category}
          onChange={(category) => set({ category })}
        />
        <NeuInput label="COMPANY / ORGANISATION" value={form.organisation} onChangeText={(v) => set({ organisation: v })} placeholder="e.g. Annapurna Caterers" />
        <NeuInput label="PURPOSE *" value={form.purpose} onChangeText={(v) => set({ purpose: v })} placeholder="e.g. Mess kitchen duty" />
        <NeuInput label="REPORTING TO" value={form.hostName} onChangeText={(v) => set({ hostName: v })} placeholder="Person or department (optional)" />
        <NeuInput label="VEHICLE NUMBER PLATE" value={form.vehiclePlate} autoCapitalize="characters" onChangeText={(v) => set({ vehiclePlate: v })} placeholder="Optional" />
      </Card>

      <Card title="ID DOCUMENT">
        <NeuDropdown label="DOCUMENT CHECKED *" options={ID_TYPES} selectedValue={form.idType || null} onSelect={(v) => set({ idType: v })} placeholder="Which document?" />
        <NeuInput label="LAST 4 CHARACTERS" value={form.idLastFour} autoCapitalize="characters" maxLength={4} onChangeText={(v) => set({ idLastFour: v.toUpperCase().slice(0, 4) })} placeholder="Optional" />
        {idPhoto ? <Image source={{ uri: idPhoto.uri }} style={styles.photo} resizeMode="contain" /> : null}
        <NeuButton title={idPhoto ? 'Replace ID photo' : 'Add ID photo (optional)'} variant="ghost" size="sm" onPress={pickPhoto} />
      </Card>

      <Card title="SCHEDULE">
        <View style={styles.row}>
          <View style={styles.cell}>
            <NativeDateTimePicker
              label="FIRST DAY"
              mode="date"
              value={keyToDate(form.validFrom)}
              minimumDate={keyToDate(today)}
              onChange={(d) => {
                const validFrom = dateToKey(d);
                set({ validFrom, validUntil: form.validUntil < validFrom ? validFrom : form.validUntil });
              }}
            />
          </View>
          <View style={styles.cell}>
            <NativeDateTimePicker
              label="LAST DAY"
              mode="date"
              value={keyToDate(form.validUntil)}
              minimumDate={keyToDate(form.validFrom)}
              maximumDate={keyToDate(addDaysKey(form.validFrom, MAX_DAYS - 1))}
              onChange={(d) => set({ validUntil: dateToKey(d) })}
            />
          </View>
        </View>
        <Muted>{days} days{days > MAX_DAYS ? ` — the maximum is ${MAX_DAYS}` : ''}</Muted>

        <Text style={styles.label}>DAYS OF THE WEEK</Text>
        <Chips
          options={[
            { key: 'mon-sat', label: 'Mon–Sat' },
            { key: 'mon-fri', label: 'Mon–Fri' },
            { key: 'all', label: 'Every day' },
          ]}
          value={
            form.weekdays.join() === '1,2,3,4,5,6' ? 'mon-sat' : form.weekdays.join() === '1,2,3,4,5' ? 'mon-fri' : form.weekdays.length === 7 ? 'all' : ('custom' as any)
          }
          onChange={(k) => set({ weekdays: k === 'mon-sat' ? [1, 2, 3, 4, 5, 6] : k === 'mon-fri' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6] })}
        />
        <View style={styles.days}>
          {WEEKDAY_SHORT.map((label, day) => {
            const on = form.weekdays.includes(day);
            return (
              <NeuButton
                key={label}
                title={label}
                size="sm"
                variant={on ? 'primary' : 'ghost'}
                onPress={() => set({ weekdays: on ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day].sort() })}
              />
            );
          })}
        </View>

        <View style={styles.row}>
          <View style={styles.cell}>
            <NativeDateTimePicker label="DAILY FROM" mode="time" value={timeToDate(form.dailyStart)} onChange={(d) => set({ dailyStart: toHHMM(d) })} />
          </View>
          <View style={styles.cell}>
            <NativeDateTimePicker label="DAILY UNTIL" mode="time" value={timeToDate(form.dailyEnd)} onChange={(d) => set({ dailyEnd: toHHMM(d) })} />
          </View>
        </View>
        <Muted>Entry opens 30 minutes before the daily start. Still inside an hour after the end counts as an overstay.</Muted>

        <NeuInput label="NOTES" value={form.notes} onChangeText={(v) => set({ notes: v })} multiline placeholder="Optional" />
      </Card>

      <ErrorText>{error}</ErrorText>

      {matches ? (
        <WatchlistAlert
          matches={matches}
          busy={saving}
          error={watchlistError}
          denyLabel="Do not issue"
          admitLabel="Issue anyway"
          body="This person or vehicle is on the watchlist. If you issue the pass anyway, your reason is recorded in the audit log."
          onDeny={() => router.back()}
          onAdmit={(reason) => issue(reason)}
        />
      ) : (
        <NeuButton title="Issue pass" variant="accent" size="lg" loading={saving} disabled={!ready} onPress={() => issue()} />
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  label: { ...Typography.tiny, color: Colors.gray600, fontWeight: '700', letterSpacing: 0.5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  cell: { flexGrow: 1, flexBasis: 160 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  photo: { width: '100%', height: 200, borderRadius: Radius.lg, backgroundColor: Colors.gray100 },
});
