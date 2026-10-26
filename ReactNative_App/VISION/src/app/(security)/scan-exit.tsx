/**
 * Scan a pass — the one scanner at the gate, for arrivals and departures.
 *
 * The officer does not choose "entry" or "exit"; the server decides from the pass. A
 * walk-in pass, or a visit permit that is already checked in, is a departure and is
 * recorded at once. An approved permit that is not yet checked in is an arrival: this
 * screen hands it to `permit-checkin`, where the officer looks at the visitor before
 * anything is written. A regular (multi-day) pass that is valid now shows a short confirm
 * card here — its ID was checked when it was issued, so a daily arrival is one tap.
 *
 * Outcomes are visually unmistakable, because an officer reads this at a glance while a
 * vehicle waits:
 *
 *   green   signed out, let them through
 *   amber   already signed out, expired, too early, window over — a conversation
 *   red     forged, altered, or a cancelled permit. Do not let them through.
 *
 * A forged pass returns HTTP 200 with `success: false`, not an error status, so this
 * screen must branch on the payload rather than on whether the request threw. Conflating
 * the two would make "no network" and "forged pass" look identical, which at a gate is the
 * difference between "try again" and "stop that vehicle".
 */

import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import {
  gateAPI,
  GateEntry,
  RECURRING_CATEGORY_LABELS,
  RecurringPreview,
  WatchlistMatch,
} from '@/services/gate.api';
import { WatchlistAlert } from '@/components/gate/WatchlistAlert';

type Outcome =
  | { kind: 'ok'; entry: GateEntry }
  | { kind: 'in'; entry: GateEntry }
  | { kind: 'warn'; title: string; detail: string; entry?: GateEntry }
  | { kind: 'deny'; title: string; detail: string }
  // A regular pass valid now: waiting for the officer's tap. The token is kept to confirm.
  | { kind: 'regular'; recurring: RecurringPreview; passToken: string; matches: WatchlistMatch[] };

/** Refusals that are a conversation (amber), not an incident (red). */
const WARN_TITLES: Record<string, string> = {
  too_early: 'Too early for this visit',
  window_over: 'Visit window is over',
  already_checked_in: 'Already checked in',
  not_checked_in: 'Never checked in',
  not_today: 'Not valid today',
  outside_hours: 'Outside the pass hours',
  not_started: 'Pass has not started yet',
  expired: 'Pass has ended',
};

export default function ScanExitScreen() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const [processing, setProcessing] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

  /**
   * Guards against the barcode callback firing repeatedly.
   *
   * expo-camera calls `onBarcodeScanned` on every frame the code is visible — several
   * times a second while the officer holds the phone there. Without a lock that is a
   * burst of identical exit requests, and the second one comes back "already exited",
   * overwriting the success the officer just saw with a warning.
   *
   * A ref rather than state, because it has to be true before the next frame's callback
   * runs, and a state update is not visible until the next render.
   */
  const scanLock = useRef(false);

  // Back from the check-in screen: ready for the next pass.
  useFocusEffect(
    useCallback(() => {
      setOutcome(null);
      scanLock.current = false;
    }, [])
  );

  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
      if (scanLock.current || processing) return;
      scanLock.current = true;

      setProcessing(true);
      setOutcome(null);

      try {
        const token = await getIdToken();
        const result = await gateAPI.scan(token, data);
        const action = result.data?.action;
        const visitorName = result.data?.preview?.visitor.name ?? result.data?.recurring?.holderName;

        if (result.success && action === 'check_in') {
          // An arrival. Nothing has been written; the officer confirms on the next screen.
          router.push({ pathname: '/(security)/permit-checkin', params: { token: data } } as never);
          return;
        } else if (result.success && action === 'check_in_recurring' && result.data?.recurring) {
          setOutcome({
            kind: 'regular',
            recurring: result.data.recurring,
            passToken: data,
            matches: result.data.recurring.watchlist ?? [],
          });
        } else if (result.success && result.data?.entry) {
          setOutcome({ kind: 'ok', entry: result.data.entry });
        } else if (result.error === 'not_approved' || result.error === 'revoked') {
          const what = result.error === 'revoked' ? 'Pass revoked' : 'Permit withdrawn';
          setOutcome({
            kind: 'deny',
            title: visitorName ? `${what} — ${visitorName}` : what,
            detail: result.message || 'This pass can no longer be used.',
          });
        } else if (result.error && WARN_TITLES[result.error]) {
          setOutcome({
            kind: 'warn',
            title: visitorName
              ? `${WARN_TITLES[result.error]} — ${visitorName}`
              : WARN_TITLES[result.error],
            detail: result.message || '',
          });
        } else if (result.error === 'already_exited') {
          setOutcome({
            kind: 'warn',
            title: 'Already signed out',
            detail: result.message || 'This visitor has already been signed out.',
            entry: result.data?.entry,
          });
        } else if (result.error === 'network') {
          setOutcome({
            kind: 'warn',
            title: 'No connection',
            detail: 'Could not reach the server. Try again, or record the exit on paper.',
          });
        } else {
          // Everything else — a bad signature, an expired pass, a pass with no record —
          // is a refusal, and the server's message says which.
          setOutcome({
            kind: 'deny',
            title: 'Pass not accepted',
            detail: result.message || 'This pass could not be verified.',
          });
        }
      } catch (err) {
        setOutcome({
          kind: 'warn',
          title: 'Scan failed',
          detail: err instanceof Error ? err.message : 'Something went wrong. Try again.',
        });
      } finally {
        setProcessing(false);
      }
    },
    [getIdToken, processing, router]
  );

  const scanAgain = () => {
    setOutcome(null);
    setWatchlistError(null);
    scanLock.current = false;
  };

  /** Confirm a regular pass holder's arrival; `overrideReason` after a watchlist alert. */
  const checkInRegular = async (overrideReason?: string) => {
    if (outcome?.kind !== 'regular') return;
    const current = outcome;
    setWatchlistError(null);
    setProcessing(true);
    try {
      const token = await getIdToken();
      const result = await gateAPI.checkInRecurring(token, {
        passToken: current.passToken,
        watchlistOverride: overrideReason ? { reason: overrideReason } : undefined,
      });

      if (result.error === 'watchlist_hit') {
        setOutcome({ ...current, matches: result.data?.matches ?? current.matches });
        if (overrideReason) setWatchlistError(result.message || null);
        return;
      }
      if (result.success && result.data?.entry) {
        setOutcome({ kind: 'in', entry: result.data.entry });
        return;
      }
      setOutcome({
        kind: result.error && WARN_TITLES[result.error] ? 'warn' : 'deny',
        title: result.error && WARN_TITLES[result.error] ? WARN_TITLES[result.error] : 'Could not check in',
        detail: result.message || result.error || 'Try again.',
      });
    } finally {
      setProcessing(false);
    }
  };

  const denyRegular = async () => {
    if (outcome?.kind !== 'regular') return;
    const current = outcome.recurring;
    setProcessing(true);
    try {
      const token = await getIdToken();
      await gateAPI.recordDenial(token, {
        visitorName: current.holderName,
        phone: current.phone,
        plate: current.plate ?? undefined,
        reason: 'Denied entry after a watchlist alert',
        source: 'recurring',
      });
      setOutcome({
        kind: 'deny',
        title: `Entry denied — ${current.holderName}`,
        detail: 'The refusal has been recorded and admin has been alerted.',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.navy900} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          Scanning a pass uses the camera. You can also look a visitor up by pass code from
          the "Who is on campus" screen.
        </Text>
        <NeuButton title="Allow camera" variant="accent" size="md" onPress={requestPermission} />
        <Pressable onPress={() => router.back()} style={styles.link}>
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          // Detaching the handler once there is an outcome stops the camera re-firing on
          // the same code that is still sitting in front of the lens.
          onBarcodeScanned={outcome || processing ? undefined : handleScan}
        />
        {/* Layered on top as a sibling — CameraView does not support children. */}
        <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none">
          <View style={styles.guide} />
          <Text style={styles.guideHint}>Point at a gate pass or visit permit</Text>
        </View>
      </View>

      <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panel}>
        {processing && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Colors.navy900} />
            <Text style={styles.status}>Verifying the pass…</Text>
          </View>
        )}

        {outcome?.kind === 'ok' && (
          <View style={[styles.resultCard, styles.okCard]}>
            <Text style={styles.okTitle}>✓ SIGNED OUT</Text>
            <Text style={styles.resultName}>{outcome.entry.visitorName}</Text>
            <Text style={styles.resultMeta}>
              {outcome.entry.passCode}
              {outcome.entry.vehicle ? `  ·  ${outcome.entry.vehicle.plate}` : ''}
              {outcome.entry.partySize > 1
                ? `  ·  party of ${outcome.entry.partySize}`
                : ''}
            </Text>
            <Text style={styles.okBody}>Let them through.</Text>
          </View>
        )}

        {outcome?.kind === 'in' && (
          <View style={[styles.resultCard, styles.okCard]}>
            <Text style={styles.okTitle}>✓ CHECKED IN</Text>
            <Text style={styles.resultName}>{outcome.entry.visitorName}</Text>
            <Text style={styles.resultMeta}>
              {outcome.entry.passCode}
              {outcome.entry.vehicle ? `  ·  ${outcome.entry.vehicle.plate}` : ''}
            </Text>
            <Text style={styles.okBody}>Let them in. The same pass signs them out.</Text>
          </View>
        )}

        {outcome?.kind === 'regular' && (
          <View style={[styles.resultCard, styles.regularCard]}>
            <Text style={styles.regularTitle}>
              REGULAR PASS · {RECURRING_CATEGORY_LABELS[outcome.recurring.category] ?? outcome.recurring.category}
            </Text>
            <Text style={styles.resultName}>{outcome.recurring.holderName}</Text>
            <Text style={styles.resultMeta}>
              {[outcome.recurring.organisation, outcome.recurring.passCode, outcome.recurring.plate]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
            <Text style={styles.resultMeta}>{outcome.recurring.schedule}</Text>
            <Text style={styles.resultMeta}>{outcome.recurring.purpose}</Text>
          </View>
        )}

        {outcome?.kind === 'regular' &&
          (outcome.matches.length > 0 ? (
            <WatchlistAlert
              matches={outcome.matches}
              busy={processing}
              error={watchlistError}
              onDeny={denyRegular}
              onAdmit={(reason) => checkInRegular(reason)}
            />
          ) : (
            <NeuButton
              title="Check in"
              variant="accent"
              size="lg"
              fullWidth
              loading={processing}
              onPress={() => checkInRegular()}
            />
          ))}

        {outcome?.kind === 'warn' && (
          <View style={[styles.resultCard, styles.warnCard]}>
            <Text style={styles.warnTitle}>{outcome.title}</Text>
            {outcome.entry && (
              <>
                <Text style={styles.resultName}>{outcome.entry.visitorName}</Text>
                <Text style={styles.resultMeta}>
                  {outcome.entry.exitAt
                    ? `Left at ${new Date(outcome.entry.exitAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : outcome.entry.passCode}
                </Text>
              </>
            )}
            <Text style={styles.warnBody}>{outcome.detail}</Text>
          </View>
        )}

        {outcome?.kind === 'deny' && (
          <View style={[styles.resultCard, styles.denyCard]}>
            <Text style={styles.denyTitle}>✕ {outcome.title.toUpperCase()}</Text>
            <Text style={styles.denyBody}>{outcome.detail}</Text>
          </View>
        )}

        {outcome && (
          <NeuButton
            title={outcome.kind === 'regular' ? 'Cancel — scan another pass' : 'Scan the next pass'}
            variant="primary"
            size="lg"
            fullWidth
            onPress={scanAgain}
          />
        )}

        <Pressable onPress={() => router.back()} style={styles.link}>
          <Text style={styles.linkText}>Back to the gate</Text>
        </Pressable>
      </ScrollView>
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
  permissionTitle: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionBody: {
    ...Typography.bodySm,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 20,
  },

  camera: { flex: 1 },
  overlay: { alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  guide: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: Colors.white,
    borderRadius: Radius.xl,
  },
  guideHint: {
    ...Typography.caption,
    color: Colors.white,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },

  panelScroll: { maxHeight: '60%', flexGrow: 0, backgroundColor: Colors.neuBackground },
  panel: {
    backgroundColor: Colors.neuBackground,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
    minHeight: 200,
  },
  regularCard: { backgroundColor: '#EEF3FB' },
  regularTitle: { ...Typography.tiny, color: Colors.orange600, fontWeight: '800', letterSpacing: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  status: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '700' },

  resultCard: { padding: Spacing.lg, borderRadius: Radius.xl, gap: 4 },
  okCard: { backgroundColor: '#E6F6EC' },
  warnCard: { backgroundColor: '#FFF4E0' },
  denyCard: { backgroundColor: '#FDE4E4' },

  okTitle: { ...Typography.tiny, color: Colors.green600, fontWeight: '800', letterSpacing: 1 },
  warnTitle: { ...Typography.bodyMd, color: Colors.orange600, fontWeight: '800' },
  denyTitle: { ...Typography.bodyMd, color: Colors.red600, fontWeight: '800', letterSpacing: 0.5 },

  resultName: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800' },
  resultMeta: { ...Typography.caption, color: Colors.gray600 },
  okBody: { ...Typography.bodySm, color: Colors.green600, fontWeight: '700', marginTop: 4 },
  warnBody: { ...Typography.bodySm, color: Colors.gray700, marginTop: 4, lineHeight: 19 },
  denyBody: { ...Typography.bodySm, color: Colors.red600, fontWeight: '700', marginTop: 4, lineHeight: 19 },

  link: { alignItems: 'center', paddingVertical: Spacing.sm },
  linkText: { ...Typography.bodySm, color: Colors.gray600 },
});
