/**
 * RegularPassView — a multi-day pass: its QR, schedule and holder.
 *
 * Shared by the security app (right after issuing it at the gate) and the admin console
 * (to show or print it). The QR is reused every day the pass covers, so the screen says
 * plainly which days and hours it works, and whether the holder is inside right now.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { AccountLinkCard } from '@/components/gate/AccountLinkCard';
import { RECURRING_CATEGORY_LABELS, RecurringPass } from '@/services/gate.api';
import { formatDateKey, formatIstDateTime } from '@/utils/istDate';

interface RegularPassViewProps {
  pass: RecurringPass;
  passToken: string | null;
  onConfirmLink: () => Promise<string | null>;
}

export function RegularPassView({ pass, passToken, onConfirmLink }: RegularPassViewProps) {
  const statusText =
    pass.status === 'revoked'
      ? `Revoked${pass.revokeReason ? ` — ${pass.revokeReason}` : ''}`
      : pass.status === 'expired'
        ? `Ended on ${formatDateKey(pass.validUntil)}`
        : pass.onCampus
          ? 'On campus now — the next scan signs them out'
          : 'Not on campus — the next scan checks them in';

  return (
    <View style={styles.wrap}>
      <View style={[styles.qrCard, neuOutset(5, 12, Colors.neuSurface)]}>
        <Text style={styles.badge}>REGULAR PASS · {RECURRING_CATEGORY_LABELS[pass.category] ?? pass.category}</Text>
        <Text style={styles.name}>{pass.holderName}</Text>
        {pass.organisation ? <Text style={styles.org}>{pass.organisation}</Text> : null}

        {passToken ? (
          // White, with a quiet zone, whatever the theme: a camera locks on faster.
          <View style={styles.qrFrame}>
            <QRCode value={passToken} size={220} backgroundColor="#FFFFFF" color="#0B1B33" ecl="M" />
          </View>
        ) : (
          <View style={[styles.qrFrame, styles.qrGone]}>
            <Text style={styles.qrGoneText}>No QR — this pass is {pass.status}</Text>
          </View>
        )}

        <Text style={styles.codeLabel}>PASS CODE</Text>
        <Text style={styles.code}>{pass.passCode}</Text>
        <Text style={[styles.status, pass.status !== 'active' && styles.statusBad]}>{statusText}</Text>
      </View>

      <View style={[styles.detailCard, neuInset(3, 6, '#F3F6FA')]}>
        <Detail label="Valid" value={`${formatDateKey(pass.validFrom)} – ${formatDateKey(pass.validUntil)}`} />
        <Detail label="When" value={pass.schedule} />
        <Detail label="Purpose" value={pass.purpose} />
        {pass.hostName ? <Detail label="Visiting" value={pass.hostName} /> : null}
        <Detail label="Phone" value={pass.phone} />
        {pass.vehiclePlate ? <Detail label="Vehicle" value={pass.vehiclePlate} /> : null}
        <Detail label="ID checked" value={`${pass.idType}${pass.idLastFour ? ` ·· ${pass.idLastFour}` : ''}`} />
        <Detail label="Issued by" value={`${pass.issuedByEmployeeId ?? '—'} (${pass.issuedByRole ?? '—'})`} />
        {pass.lastEntryAt ? <Detail label="Last entry" value={formatIstDateTime(pass.lastEntryAt)} /> : null}
      </View>

      <AccountLinkCard
        linkedLabel={pass.linkedAccountLabel}
        suggestedLabel={pass.suggestedAccountLabel}
        onConfirm={onConfirmLink}
      />
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
  wrap: { gap: Spacing.md },
  qrCard: { padding: Spacing.lg, borderRadius: Radius['2xl'], alignItems: 'center', gap: 4 },
  badge: { ...Typography.tiny, color: Colors.orange600, fontWeight: '800', letterSpacing: 1 },
  name: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800', textAlign: 'center' },
  org: { ...Typography.caption, color: Colors.gray600 },
  qrFrame: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginVertical: Spacing.sm,
  },
  qrGone: { width: 252, height: 252, alignItems: 'center', justifyContent: 'center' },
  qrGoneText: { ...Typography.bodySm, color: Colors.gray500, textAlign: 'center' },
  codeLabel: { ...Typography.tiny, color: Colors.gray500, fontWeight: '800', letterSpacing: 1 },
  code: { fontSize: 24, lineHeight: 32, fontWeight: '800', color: Colors.navy900, letterSpacing: 3 },
  status: { ...Typography.caption, color: Colors.green600, fontWeight: '700', textAlign: 'center' },
  statusBad: { color: Colors.red600 },
  detailCard: { padding: Spacing.lg, borderRadius: Radius.xl, gap: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  detailLabel: { ...Typography.caption, color: Colors.gray500, width: 96 },
  detailValue: { ...Typography.bodySm, color: Colors.navy900, fontWeight: '600', flex: 1 },
});
