/**
 * One gate record: the visit, its log rows, and — behind a button — the ID photo the
 * officer took. Viewing the photo is written to the audit log with the admin's name, so it
 * is fetched only when asked for, never with the record.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { adminAPI, firstError } from '@/services/admin.api';
import { useAdminData } from '@/components/admin/useAdminData';
import {
  AdminPage,
  Card,
  ErrorText,
  ListRow,
  Loading,
  Pill,
  fmtDateTime,
  fmtMinutes,
} from '@/components/admin/AdminKit';

export default function GateRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();
  const { data, loading, error } = useAdminData((t) => adminAPI.entry(t, id!), [id]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  const showPhoto = async () => {
    setPhotoError(null);
    setLoadingPhoto(true);
    try {
      const result = await adminAPI.entryIdPhoto(await getIdToken(), id!);
      if (!result.success || !result.data) throw new Error(firstError(result));
      setPhoto(result.data.imageDataUri || result.data.storageUri);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not load the photo');
    } finally {
      setLoadingPhoto(false);
    }
  };

  const e = data?.entry;

  return (
    <AdminPage title={e ? e.visitorName : 'Gate record'} subtitle={e ? `Pass ${e.passCode}` : undefined}>
      <ErrorText>{error}</ErrorText>
      {!data && loading ? <Loading /> : null}

      {e && (
        <>
          <View style={styles.pills}>
            <Pill
              text={e.status === 'on_campus' ? (e.overstay ? `OVERSTAYED ${fmtMinutes(e.overstayMinutes ?? 0)}` : 'ON CAMPUS') : 'LEFT'}
              tone={e.status === 'on_campus' ? (e.overstay ? 'bad' : 'good') : 'default'}
            />
            <Pill text={e.source === 'permit' ? 'VISIT PERMIT' : e.source === 'recurring' ? 'REGULAR PASS' : 'WALK-IN'} />
            {e.linkedAccountLabel ? <Pill text={`SENT TO ${e.linkedAccountLabel}`} tone="good" /> : null}
          </View>

          {e.watchlistOverride && (
            <Card style={styles.override}>
              <Text style={styles.overrideTitle}>Admitted despite a watchlist flag</Text>
              <Text style={styles.overrideBody}>
                “{e.watchlistOverride.reason}” — {e.watchlistOverride.by}
              </Text>
            </Card>
          )}

          <Card title="VISIT">
            <Row label="Phone" value={e.phone} />
            {e.email ? <Row label="Email" value={e.email} /> : null}
            <Row label="Purpose" value={e.purpose} />
            {e.hostName ? <Row label="Visiting" value={e.hostName} /> : null}
            <Row label="Party" value={`${e.partySize}${e.companions.length ? ` — with ${e.companions.map((c) => (c.relation ? `${c.name} (${c.relation})` : c.name)).join(', ')}` : ''}`} />
            {e.vehicle ? (
              <Row
                label="Vehicle"
                value={`${e.vehicle.plate} · ${e.vehicle.source === 'ocr' ? 'read by camera' : e.vehicle.source === 'ocr_edited' ? `camera read corrected (was ${e.vehicle.plateRaw ?? '?'})` : 'typed'}`}
              />
            ) : null}
            <Row label="Gate" value={e.gate ?? '—'} />
            <Row label="Entered" value={`${fmtDateTime(e.entryAt)} — ${e.registeredByEmployeeId}`} />
            <Row label="Left" value={e.exitAt ? `${fmtDateTime(e.exitAt)} — ${e.exitedByEmployeeId ?? '—'}` : 'Still inside'} />
            <Row label="Pass valid until" value={fmtDateTime(e.expiresAt)} />
            {e.notes ? <Row label="Notes" value={e.notes} /> : null}
            {e.visitRequestId ? <Row label="Visit request" value={e.visitRequestId} /> : null}
            {e.recurringPassId ? (
              <NeuButton
                title="Open the regular pass"
                variant="ghost"
                size="sm"
                onPress={() => router.push(`/(admin)/passes/${e.recurringPassId}` as never)}
              />
            ) : null}
          </Card>

          <Card title="ID DOCUMENT">
            <Row label="Type" value={`${e.idProof.idType}${e.idProof.idLastFour ? ` ·· ${e.idProof.idLastFour}` : ''}`} />
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" />
            ) : e.idProof.hasPhoto ? (
              <>
                <Text style={styles.photoNote}>
                  Viewing the ID photo is recorded in the audit log under your name.
                </Text>
                <NeuButton title="View ID photo" variant="primary" size="sm" loading={loadingPhoto} onPress={showPhoto} />
              </>
            ) : (
              <Text style={styles.photoNote}>
                No photo on this record{e.source === 'recurring' ? ' — it is kept on the regular pass' : ''}.
              </Text>
            )}
            <ErrorText>{photoError}</ErrorText>
          </Card>

          <Card title="LOG">
            {(data?.events ?? []).map((ev) => (
              <ListRow
                key={ev.id}
                title={`${ev.type === 'entry' ? 'Entered' : ev.type === 'exit' ? 'Left' : 'Denied'} · ${fmtDateTime(ev.at)}`}
                lines={[`Officer ${ev.officerEmployeeId}${ev.gate ? ` · ${ev.gate}` : ''}`, ev.note]}
              />
            ))}
          </Card>
        </>
      )}
    </AdminPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  override: { backgroundColor: Colors.red100 },
  overrideTitle: { ...Typography.bodySm, color: Colors.red600, fontWeight: '800' },
  overrideBody: { ...Typography.bodySm, color: Colors.gray700 },
  row: { flexDirection: 'row', gap: Spacing.md },
  rowLabel: { ...Typography.caption, color: Colors.gray500, width: 120 },
  rowValue: { ...Typography.bodySm, color: Colors.navy900, fontWeight: '600', flex: 1 },
  photo: { width: '100%', height: 320, borderRadius: Radius.lg, backgroundColor: Colors.gray100 },
  photoNote: { ...Typography.caption, color: Colors.gray600 },
});
