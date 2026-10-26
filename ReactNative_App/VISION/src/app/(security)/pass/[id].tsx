/**
 * The issued gate pass — the QR the visitor shows on the way out.
 *
 * The QR encodes a *signed token*, not a record id. A code holding only an id would force
 * a database lookup on every exit scan, which is exactly what is unavailable when the
 * campus link is down — and offline gate verification is the product's core claim
 * (VISION.md §1). A signed token carries its own claims, so an officer's device can check
 * authenticity and expiry with nothing but the shared key.
 *
 * The pass code is printed underneath at a readable size on purpose. Phones die, screens
 * crack, and screenshots get deleted; a six-character code an officer can read over a
 * radio is the fallback that stops those becoming a phone call to the supervisor.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { gateAPI, GateEntry } from '@/services/gate.api';
import { AccountLinkCard } from '@/components/gate/AccountLinkCard';

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GatePassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();

  const [entry, setEntry] = useState<GateEntry | null>(null);
  const [passToken, setPassToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * The pass token is fetched rather than passed through navigation params.
   *
   * A signed token in a route parameter ends up in the navigation state, which is
   * serialised and restored across app restarts — a credential that outlives the screen
   * showing it. Re-issuing keeps the same claims and the same expiry, so this is free.
   */
  const load = useCallback(async () => {
    if (!id) return;

    setError(null);
    setLoading(true);

    try {
      const token = await getIdToken();
      const result = await gateAPI.reissuePass(token, id);

      if (!result.success || !result.data) {
        setError(result.message || 'Could not load this pass');
        return;
      }

      setEntry(result.data.entry);
      setPassToken(result.data.passToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this pass');
    } finally {
      setLoading(false);
    }
  }, [id, getIdToken]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Share the pass code and details as text — never the QR token itself.
   *
   * The token is the credential. Sending it over WhatsApp puts a valid gate pass into a
   * chat log, forwardable to anyone. The code alone is useless without the record behind
   * it, so it is safe to send and still useful at the barrier.
   */
  const handleShare = async () => {
    if (!entry) return;

    await Share.share({
      message:
        `VISION gate pass\n` +
        `Code: ${entry.passCode}\n` +
        `Visitor: ${entry.visitorName}\n` +
        `Valid until: ${formatTime(entry.expiresAt)}\n\n` +
        `Show the QR code on the VISION screen at the gate to leave.`,
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.navy900} />
      </View>
    );
  }

  if (error || !entry || !passToken) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'This pass could not be loaded'}</Text>
        <NeuButton title="Try again" variant="primary" size="md" onPress={load} />
        <Pressable onPress={() => router.replace('/(security)/home')} style={styles.link}>
          <Text style={styles.linkText}>Back to the gate</Text>
        </Pressable>
      </View>
    );
  }

  const expired = entry.expiresAt ? new Date(entry.expiresAt).getTime() < Date.now() : false;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.badge}>PASS ISSUED</Text>
          <Text style={styles.title}>{entry.visitorName}</Text>
          <Text style={styles.subtitle}>
            Show this screen to the visitor. They present it at the gate to leave.
          </Text>
        </View>

        <View style={[styles.qrCard, neuOutset(5, 12, Colors.neuSurface)]}>
          {/*
            White background and a generous quiet zone regardless of theme. A QR rendered
            on a tinted surface, or flush to its container, is measurably harder for a
            camera to lock onto in the mixed light of a gate.
          */}
          <View style={styles.qrFrame}>
            <QRCode
              value={passToken}
              size={224}
              backgroundColor="#FFFFFF"
              color="#0B1B33"
              // Medium recovery: enough to survive a scratched screen protector and a
              // fingerprint, without inflating the module count to the point where a
              // phone camera struggles at arm's length.
              ecl="M"
            />
          </View>

          <Text style={styles.passCodeLabel}>PASS CODE</Text>
          <Text style={styles.passCode}>{entry.passCode}</Text>

          {expired ? (
            <Text style={styles.expiredNote}>
              This pass expired on {formatTime(entry.expiresAt)}
            </Text>
          ) : (
            <Text style={styles.validNote}>Valid until {formatTime(entry.expiresAt)}</Text>
          )}
        </View>

        <AccountLinkCard
          linkedLabel={entry.linkedAccountLabel}
          suggestedLabel={entry.suggestedAccountLabel}
          onConfirm={async () => {
            const token = await getIdToken();
            const result = await gateAPI.linkEntry(token, entry.id);
            if (!result.success) throw new Error(result.message || result.error || 'Could not send the pass');
            const label = result.data?.linkedAccountLabel ?? null;
            setEntry({ ...entry, linkedAccountLabel: label, suggestedAccountLabel: null });
            return label;
          }}
        />

        {entry.watchlistOverride && (
          <View style={styles.overrideCard}>
            <Text style={styles.overrideTitle}>Admitted despite a watchlist flag</Text>
            <Text style={styles.overrideBody}>
              {entry.watchlistOverride.reason} — {entry.watchlistOverride.by}
            </Text>
          </View>
        )}

        <View style={[styles.detailCard, neuInset(3, 6, '#F3F6FA')]}>
          <Detail label="Phone" value={entry.phone} />
          <Detail label="Purpose" value={entry.purpose} />
          {entry.hostName && <Detail label="Visiting" value={entry.hostName} />}
          <Detail
            label="Party size"
            value={`${entry.partySize} ${entry.partySize === 1 ? 'person' : 'people'}`}
          />
          {entry.companions.length > 0 && (
            <Detail
              label="With"
              value={entry.companions
                .map((companion) =>
                  companion.relation ? `${companion.name} (${companion.relation})` : companion.name
                )
                .join(', ')}
            />
          )}
          {entry.vehicle && <Detail label="Vehicle" value={entry.vehicle.plate} mono />}
          <Detail label="ID checked" value={entry.idProof.idType} />
          <Detail label="Gate" value={entry.gate || '—'} />
          <Detail label="Entered" value={formatTime(entry.entryAt)} />
          <Detail label="Registered by" value={entry.registeredByEmployeeId} />
        </View>

        <NeuButton
          title="Share the pass code"
          variant="primary"
          size="md"
          fullWidth
          onPress={handleShare}
        />

        <NeuButton
          title="Register another visitor"
          variant="accent"
          size="lg"
          fullWidth
          onPress={() => router.replace('/(security)/register')}
        />

        <Pressable onPress={() => router.replace('/(security)/home')} style={styles.link}>
          <Text style={styles.linkText}>Back to the gate</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.detailMono]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neuBackground },
  centered: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  scroll: {
    padding: Spacing.lg,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['2xl'],
    gap: Spacing.md,
  },

  header: { gap: 4 },
  badge: { ...Typography.tiny, color: Colors.green600, fontWeight: '800', letterSpacing: 1 },
  title: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  subtitle: { ...Typography.bodySm, color: Colors.gray600 },

  qrCard: {
    padding: Spacing.lg,
    borderRadius: Radius['2xl'],
    alignItems: 'center',
    gap: 4,
  },
  qrFrame: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
  },
  passCodeLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontWeight: '800',
    letterSpacing: 1,
  },
  passCode: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
    color: Colors.navy900,
    letterSpacing: 3,
  },
  validNote: { ...Typography.caption, color: Colors.gray600 },
  expiredNote: { ...Typography.caption, color: Colors.red600, fontWeight: '700' },

  detailCard: { padding: Spacing.lg, borderRadius: Radius.xl, gap: Spacing.sm },
  overrideCard: { padding: Spacing.lg, borderRadius: Radius.xl, backgroundColor: '#FDE4E4', gap: 2 },
  overrideTitle: { ...Typography.caption, color: Colors.red600, fontWeight: '800' },
  overrideBody: { ...Typography.caption, color: Colors.gray700 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  detailLabel: { ...Typography.caption, color: Colors.gray500, width: 106 },
  detailValue: { ...Typography.bodySm, color: Colors.navy900, fontWeight: '600', flex: 1 },
  detailMono: { fontFamily: 'monospace', letterSpacing: 1 },

  errorText: { ...Typography.bodySm, color: Colors.red600, textAlign: 'center' },
  link: { alignItems: 'center', paddingVertical: Spacing.md },
  linkText: { ...Typography.bodySm, color: Colors.gray600 },
});
