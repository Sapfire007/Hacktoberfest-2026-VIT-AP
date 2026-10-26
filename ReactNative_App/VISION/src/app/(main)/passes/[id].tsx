/**
 * A gate pass in the visitor's own app — a walk-in pass security sent to this account, or
 * a regular (multi-day) pass.
 *
 * The QR is the same signed token the officer's screen shows, re-issued by the server on
 * every refresh; the visitor can show it from their own phone instead of a paper slip or a
 * photo of the officer's screen. `id` is the pass key from `gatePass.service`.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { NeuButton } from '@/components/ui/NeuButton';
import { useApp } from '@/context/AppContext';
import { RECURRING_CATEGORY_LABELS } from '@/services/gate.api';
import { formatDateKey, formatIstDateTime } from '@/utils/istDate';

export default function MyGatePassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { gatePasses, refreshGatePasses } = useApp();
  const pass = gatePasses.find((p) => p.key === id);

  // Opened from a notification before the list has loaded: fetch it.
  useEffect(() => {
    if (!pass) void refreshGatePasses();
  }, [pass, refreshGatePasses]);

  if (!pass) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Gate Pass" showLogo={false} />
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.navy900} />
          <Text style={styles.hint}>Loading your pass…</Text>
          <NeuButton title="Go back" variant="ghost" size="md" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const entry = pass.entry;
  const regular = pass.regular;

  return (
    <View style={styles.container}>
      <NeuHeader title="Gate Pass" showLogo={false} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.qrCard, neuOutset(5, 12, Colors.neuSurface)]}>
          <Text style={styles.badge}>
            {regular
              ? `REGULAR PASS · ${RECURRING_CATEGORY_LABELS[regular.category] ?? regular.category}`
              : 'GATE PASS'}
          </Text>
          <Text style={styles.name}>{regular?.holderName ?? entry?.visitorName}</Text>

          {pass.qr ? (
            <View style={styles.qrFrame}>
              <QRCode value={pass.qr} size={220} backgroundColor="#FFFFFF" color="#0B1B33" ecl="M" />
            </View>
          ) : (
            <View style={[styles.qrFrame, styles.qrGone]}>
              <Text style={styles.hint}>This pass is no longer active</Text>
            </View>
          )}

          <Text style={styles.codeLabel}>PASS CODE</Text>
          <Text style={styles.code}>{pass.passCode}</Text>
          <Text style={[styles.status, entry?.overstay && styles.statusBad]}>{pass.status}</Text>
        </View>

        <View style={[styles.detailCard, neuInset(3, 6, '#F3F6FA')]}>
          {regular ? (
            <>
              <Detail label="Valid" value={`${formatDateKey(regular.validFrom)} – ${formatDateKey(regular.validUntil)}`} />
              <Detail label="When" value={regular.schedule} />
              <Detail label="Purpose" value={regular.purpose} />
              {regular.organisation ? <Detail label="For" value={regular.organisation} /> : null}
              {regular.vehiclePlate ? <Detail label="Vehicle" value={regular.vehiclePlate} /> : null}
            </>
          ) : entry ? (
            <>
              <Detail label="Purpose" value={entry.purpose} />
              {entry.hostName ? <Detail label="Visiting" value={entry.hostName} /> : null}
              <Detail label="Entered" value={formatIstDateTime(entry.entryAt)} />
              <Detail label="Valid until" value={formatIstDateTime(entry.expiresAt)} />
              {entry.exitAt ? <Detail label="Left" value={formatIstDateTime(entry.exitAt)} /> : null}
              {entry.vehicle ? <Detail label="Vehicle" value={entry.vehicle.plate} /> : null}
              {entry.gate ? <Detail label="Gate" value={entry.gate} /> : null}
            </>
          ) : null}
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            🔒 Show this QR to the gate officer. It is signed by VISION and cannot be copied into
            a different pass. {regular ? 'The same QR works on every day your pass covers.' : 'Scan it again on your way out.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neuBackground },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  scroll: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  qrCard: { padding: Spacing.lg, borderRadius: Radius['2xl'], alignItems: 'center', gap: 4 },
  badge: { ...Typography.tiny, color: Colors.orange600, fontWeight: '800', letterSpacing: 1 },
  name: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800', textAlign: 'center' },
  qrFrame: { backgroundColor: '#FFFFFF', padding: Spacing.md, borderRadius: Radius.lg, marginVertical: Spacing.sm },
  qrGone: { width: 252, height: 252, alignItems: 'center', justifyContent: 'center' },
  codeLabel: { ...Typography.tiny, color: Colors.gray500, fontWeight: '800', letterSpacing: 1 },
  code: { fontSize: 24, lineHeight: 32, fontWeight: '800', color: Colors.navy900, letterSpacing: 3 },
  status: { ...Typography.caption, color: Colors.green600, fontWeight: '700', textAlign: 'center' },
  statusBad: { color: Colors.red600 },
  detailCard: { padding: Spacing.lg, borderRadius: Radius.xl, gap: Spacing.sm },
  detailRow: { flexDirection: 'row', gap: Spacing.md },
  detailLabel: { ...Typography.caption, color: Colors.gray500, width: 90 },
  detailValue: { ...Typography.bodySm, color: Colors.navy900, fontWeight: '600', flex: 1 },
  note: { padding: Spacing.md },
  noteText: { ...Typography.caption, color: Colors.gray600, lineHeight: 18 },
  hint: { ...Typography.bodySm, color: Colors.gray500, textAlign: 'center' },
});
