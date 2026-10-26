/**
 * AccountLinkCard — whether this pass also reached the visitor's VISION app.
 *
 * Three states:
 *   - sent: a verified account with the email the officer entered now shows the QR;
 *   - suggested: an account has the same phone number. Phone numbers on profiles are not
 *     verified, so the officer confirms with the person in front of them before sending;
 *   - neither: nothing is shown.
 * Account details are masked by the server; the officer never sees a full email address.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { Icon } from '@/components/ui/Icon';

interface AccountLinkCardProps {
  linkedLabel?: string | null;
  suggestedLabel?: string | null;
  /** Send the pass to the suggested account. Resolves to the new linked label. */
  onConfirm: () => Promise<string | null>;
}

export function AccountLinkCard({ linkedLabel, suggestedLabel, onConfirm }: AccountLinkCardProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (linkedLabel) {
    return (
      <View style={[styles.card, styles.sent]}>
        <View style={styles.titleRow}>
          <Icon name="mobile" size={18} color={Colors.green600} />
          <Text style={styles.sentTitle}>Sent to their VISION app</Text>
        </View>
        <Text style={styles.body}>
          The QR also appears in the account {linkedLabel}. They can show it from their phone.
        </Text>
      </View>
    );
  }

  if (!suggestedLabel) return null;

  const confirm = async () => {
    setError(null);
    setSending(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the pass');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.card, styles.suggested]}>
      <Text style={styles.suggestedTitle}>Possible VISION account</Text>
      <Text style={styles.body}>
        An account with this phone number exists: {suggestedLabel}. Ask the visitor whether it is
        theirs before sending.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <NeuButton
        title="Yes — send the pass to this account"
        variant="primary"
        size="sm"
        fullWidth
        loading={sending}
        onPress={confirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.lg, borderRadius: Radius.xl, gap: Spacing.xs },
  sent: { backgroundColor: '#E6F6EC' },
  suggested: { backgroundColor: '#EEF3FB' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sentTitle: { ...Typography.bodyMd, color: Colors.green600, fontWeight: '800' },
  suggestedTitle: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '800' },
  body: { ...Typography.caption, color: Colors.gray700, lineHeight: 18, marginBottom: Spacing.xs },
  error: { ...Typography.caption, color: Colors.red600 },
});
