/**
 * WatchlistAlert — the red card shown when the person at the gate matches the watchlist.
 *
 * The officer decides (VISION.md: "alert, officer decides"). **Deny entry** records the
 * refusal. **Admit anyway** needs a written reason, which is stored with the entry and
 * raised to admin. There is no way to dismiss the card without choosing one of the two:
 * an alert that can be swiped away is an alert that gets swiped away.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { Icon } from '@/components/ui/Icon';
import type { WatchlistMatch } from '@/services/gate.api';

const MIN_REASON = 10;

const MATCHED_ON: Record<string, string> = {
  phone: 'phone number',
  plate: 'number plate',
  account: 'VISION account',
};

interface WatchlistAlertProps {
  matches: WatchlistMatch[];
  /** Record the refusal. */
  onDeny: () => Promise<void> | void;
  /** Retry the admission with the officer's reason. */
  onAdmit: (reason: string) => Promise<void> | void;
  busy?: boolean;
  /** A message from the server, e.g. the reason was too short. */
  error?: string | null;
  /** Wording for admin issuing a pass in advance, where nobody is at a gate. */
  denyLabel?: string;
  admitLabel?: string;
  body?: string;
}

export function WatchlistAlert({
  matches,
  onDeny,
  onAdmit,
  busy,
  error,
  denyLabel = 'Deny entry',
  admitLabel = 'Admit anyway',
  body = 'Do not admit without checking. If you let them in, your reason is recorded and sent to admin.',
}: WatchlistAlertProps) {
  const [admitting, setAdmitting] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <View style={styles.card}>
      <View style={styles.titleContainer}>
        <Icon name="warning" size={20} color={Colors.red600} />
        <Text style={styles.title}>WATCHLIST MATCH</Text>
      </View>
      {matches.map((match) => (
        <View key={match.id} style={styles.match}>
          <Text style={styles.name}>{match.name}</Text>
          <Text style={styles.reason}>{match.reason}</Text>
          <Text style={styles.matchedOn}>
            Matched on {match.matchedOn.map((m) => MATCHED_ON[m] ?? m).join(' and ')}
          </Text>
        </View>
      ))}

      <Text style={styles.body}>{body}</Text>

      {admitting ? (
        <>
          <NeuInput
            label="WHY ARE YOU GOING AHEAD? *"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Confirmed with the Dean's office, escorted to the admin block"
            multiline
            numberOfLines={3}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <NeuButton
            title={`Confirm — ${admitLabel.toLowerCase()}`}
            variant="danger"
            size="md"
            fullWidth
            loading={busy}
            disabled={reason.trim().length < MIN_REASON}
            onPress={() => onAdmit(reason.trim())}
          />
          <Text style={styles.hint}>
            {reason.trim().length < MIN_REASON
              ? `At least ${MIN_REASON} characters (${reason.trim().length} so far)`
              : ' '}
          </Text>
          <NeuButton
            title="Back"
            variant="ghost"
            size="sm"
            fullWidth
            onPress={() => setAdmitting(false)}
          />
        </>
      ) : (
        <View style={styles.actions}>
          <NeuButton
            title={denyLabel}
            variant="danger"
            size="md"
            fullWidth
            loading={busy}
            onPress={() => onDeny()}
          />
          <NeuButton
            title={`${admitLabel}…`}
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => setAdmitting(true)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FDE4E4',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.red600,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: { ...Typography.bodyMd, color: Colors.red600, fontWeight: '900', letterSpacing: 1 },
  match: { gap: 2, paddingVertical: Spacing.xs },
  name: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800' },
  reason: { ...Typography.bodySm, color: Colors.red600, fontWeight: '700' },
  matchedOn: { ...Typography.tiny, color: Colors.gray600 },
  body: { ...Typography.caption, color: Colors.gray700, lineHeight: 18 },
  actions: { gap: Spacing.sm },
  hint: { ...Typography.tiny, color: Colors.gray500, textAlign: 'center' },
  error: { ...Typography.caption, color: Colors.red600 },
});
