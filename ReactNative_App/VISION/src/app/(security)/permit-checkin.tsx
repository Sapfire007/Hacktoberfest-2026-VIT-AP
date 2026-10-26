/**
 * Check in a visit-permit holder.
 *
 * Reached from the scanner when a pass turns out to be an approved permit that has not
 * been used yet. Nothing has been recorded at that point: the officer first compares the
 * person in front of them with the permit — photo, name, who they are visiting and when —
 * and only "Check in" writes the gate entry.
 *
 * Unlike a walk-in, the visitor's details come from the approved request and cannot be
 * edited here. What the officer adds is what only the gate can know: which ID document
 * they actually inspected, the vehicle they actually arrived in, and anyone who came with
 * them. The plate follows the same rule as walk-in registration — the camera suggests it,
 * the text field owns it.
 *
 * The ID photo is required only when the visitor has no ID on file, which is always the
 * case for a parent sponsored by a student: they have no account, so the gate is the
 * first place anyone checks who they are.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Switch,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { Icon } from '@/components/ui/Icon';
import { NeuDropdown } from '@/components/ui/NeuDropdown';
import { PlateScanner, AcceptedPlate } from '@/components/anpr/PlateScanner';
import { useAuth } from '@/context/AuthContext';
import { gateAPI, GateEntry, PermitPreview, WatchlistMatch } from '@/services/gate.api';
import { ID_TYPES, GATES } from '@/constants/gate';
import { WatchlistAlert } from '@/components/gate/WatchlistAlert';

interface PlateState {
  value: string;
  source: 'manual' | 'ocr' | 'ocr_edited';
  confidence: number | null;
  ocrRaw: string | null;
}

interface CompanionRow {
  key: string;
  name: string;
  relation: string;
}

function formatWindow(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—';
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time(start)} – ${time(end)}`;
}

export default function PermitCheckInScreen() {
  const router = useRouter();
  const { token: passToken } = useLocalSearchParams<{ token: string }>();
  const { getIdToken } = useAuth();

  const [preview, setPreview] = useState<PermitPreview | null>(null);
  const [loading, setLoading] = useState(true);
  // A permit that cannot be used (any more): the reason, and the check-in is not offered.
  const [blocked, setBlocked] = useState<string | null>(null);

  const [idType, setIdType] = useState('');
  const [idLastFour, setIdLastFour] = useState('');
  const [idPhoto, setIdPhoto] = useState<{ dataUri: string; previewUri: string } | null>(null);
  const [capturingId, setCapturingId] = useState(false);

  const [hasVehicle, setHasVehicle] = useState(false);
  const [plate, setPlate] = useState<PlateState>({
    value: '',
    source: 'manual',
    confidence: null,
    ocrRaw: null,
  });
  const [scannerOpen, setScannerOpen] = useState(false);

  const [companions, setCompanions] = useState<CompanionRow[]>([]);
  const [gate, setGate] = useState(GATES[0]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<GateEntry | null>(null);
  // Watchlist matches, from the preview or a 409 on check-in. Non-empty: the officer must
  // decide before anything else.
  const [watchlistMatches, setWatchlistMatches] = useState<WatchlistMatch[]>([]);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!passToken) {
      setBlocked('No pass was scanned.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getIdToken();
      const result = await gateAPI.previewPermit(token, passToken);
      const found = result.data?.preview ?? null;

      if (found) {
        setPreview(found);
        setWatchlistMatches(found.watchlist ?? []);
        setIdType(found.visitor.idTypeOnFile || '');
        setHasVehicle(Boolean(found.plate));
        setPlate((current) => ({ ...current, value: found.plate || '' }));
      }
      if (!result.success) {
        setBlocked(result.message || 'This permit cannot be used right now.');
      }
    } catch (err) {
      setBlocked(err instanceof Error ? err.message : 'Could not load the permit');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, passToken]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleTypedPlate = (value: string) => {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9 ]/g, '');
    setPlate((current) => ({
      ...current,
      value: normalized,
      source:
        current.source === 'manual'
          ? 'manual'
          : normalized === current.ocrRaw
            ? 'ocr'
            : 'ocr_edited',
    }));
  };

  const handleScannedPlate = (result: AcceptedPlate) => {
    setScannerOpen(false);
    setHasVehicle(true);
    setPlate({
      value: result.plate,
      source: 'ocr',
      confidence: result.confidence,
      ocrRaw: result.plate,
    });
  };

  /** Camera only, downscaled — the same rules as walk-in registration. */
  const handleCaptureId = async () => {
    setError(null);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera access is needed to photograph the ID document');
      return;
    }

    try {
      setCapturingId(true);
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
        allowsEditing: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError('The photo could not be read. Try again.');
        return;
      }

      setIdPhoto({ dataUri: `data:image/jpeg;base64,${asset.base64}`, previewUri: asset.uri });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the camera');
    } finally {
      setCapturingId(false);
    }
  };

  const handleCheckIn = async (overrideReason?: string) => {
    if (!preview || !passToken) return;
    setError(null);
    setWatchlistError(null);

    if (!idType) return setError('Select which ID document you checked');
    if (preview.idPhotoRequired && !idPhoto) {
      return setError('This visitor has no ID on file. Photograph the ID you checked.');
    }
    if (hasVehicle && !plate.value.trim()) {
      return setError('Enter the number plate, or turn off "arrived by vehicle"');
    }

    try {
      setSubmitting(true);
      const token = await getIdToken();

      const result = await gateAPI.checkInPermit(token, {
        passToken,
        idType,
        idLastFour: idLastFour.trim() || undefined,
        idImageDataUri: idPhoto?.dataUri,
        // Always explicit: `null` records that they came without the vehicle on the request.
        vehicle: hasVehicle
          ? {
              plate: plate.value,
              plateRaw: plate.ocrRaw ?? plate.value,
              source: plate.source,
              confidence: plate.confidence ?? undefined,
            }
          : null,
        companions: companions
          .filter((companion) => companion.name.trim())
          .map((companion) => ({
            name: companion.name.trim(),
            relation: companion.relation.trim() || null,
          })),
        gate,
        watchlistOverride: overrideReason ? { reason: overrideReason } : undefined,
      });

      if (result.error === 'watchlist_hit') {
        setWatchlistMatches(result.data?.matches ?? watchlistMatches);
        if (overrideReason) setWatchlistError(result.message || null);
        return;
      }
      if (result.success && result.data) {
        setCheckedIn(result.data.entry);
        return;
      }

      // A refusal (cancelled meanwhile, another officer got there first) is final for this
      // permit; a validation message is something the officer can fix and retry.
      const refusals = ['not_found', 'not_approved', 'too_early', 'window_over', 'already_checked_in'];
      if (result.error && refusals.includes(result.error)) {
        setBlocked(result.message || 'This permit can no longer be used.');
      } else {
        setError(result.message || result.error || 'Could not check the visitor in');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the visitor in');
    } finally {
      setSubmitting(false);
    }
  };

  /** Turned away after the watchlist alert: recorded, and the permit is not used. */
  const handleDeny = async () => {
    if (!preview) return;
    try {
      setSubmitting(true);
      const token = await getIdToken();
      const result = await gateAPI.recordDenial(token, {
        visitorName: preview.visitor.name,
        phone: preview.visitor.phone ?? undefined,
        plate: hasVehicle ? plate.value : undefined,
        gate,
        reason: 'Denied entry after a watchlist alert',
        source: 'permit',
      });
      if (!result.success) {
        setWatchlistError(result.message || 'Could not record the denial — try again');
        return;
      }
      setWatchlistMatches([]);
      setBlocked('Entry denied after a watchlist alert. The refusal has been recorded and admin alerted.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.navy900} />
        <Text style={styles.subtitle}>Loading the permit…</Text>
      </View>
    );
  }

  if (checkedIn) {
    return (
      <View style={styles.centered}>
        <View style={[styles.resultCard, styles.okCard]}>
          <Text style={styles.okTitle}>✓ CHECKED IN</Text>
          <Text style={styles.resultName}>{checkedIn.visitorName}</Text>
          <Text style={styles.resultMeta}>
            {checkedIn.passCode}
            {checkedIn.vehicle ? `  ·  ${checkedIn.vehicle.plate}` : ''}
            {checkedIn.partySize > 1 ? `  ·  party of ${checkedIn.partySize}` : ''}
          </Text>
          <Text style={styles.okBody}>Let them through. The same permit signs them out.</Text>
        </View>
        <NeuButton
          title="Scan the next pass"
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => router.back()}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.badge}>VISIT PERMIT</Text>
          <Text style={styles.title}>Check the visitor</Text>
          <Text style={styles.subtitle}>
            Compare the person with the permit. Nothing is recorded until you check them in.
          </Text>
        </View>

        {preview && (
          <View style={[styles.visitorCard, neuOutset(4, 8, Colors.neuSurface)]}>
            <View style={styles.visitorRow}>
              {preview.visitor.photoUri ? (
                <Image source={{ uri: preview.visitor.photoUri }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoMissing]}>
                  <Text style={styles.photoMissingText}>No photo{'\n'}on file</Text>
                </View>
              )}
              <View style={styles.visitorText}>
                <Text style={styles.visitorName}>{preview.visitor.name}</Text>
                {preview.visitor.relation || preview.visitor.sponsorName ? (
                  <Text style={styles.visitorMeta}>
                    {[
                      preview.visitor.relation,
                      preview.visitor.sponsorName
                        ? `sponsored by ${preview.visitor.sponsorName}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
                {preview.visitor.phone ? (
                  <Text style={styles.visitorMeta}>{preview.visitor.phone}</Text>
                ) : null}
                <Text style={styles.permitId}>{preview.permitId}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Detail label="VISITING" value={`${preview.host.name}${preview.host.department ? ` · ${preview.host.department}` : ''}`} />
            <Detail label="WHERE" value={preview.destination} />
            <Detail label="PURPOSE" value={preview.purpose} />
            <Detail label="APPROVED WINDOW" value={formatWindow(preview.visitStartAt, preview.visitEndAt)} />
            <Detail
              label="ID ON FILE"
              value={
                preview.visitor.idTypeOnFile
                  ? `${preview.visitor.idTypeOnFile}${preview.visitor.idVerified ? ' · verified' : ' · not verified'}`
                  : 'None — check a document now'
              }
            />
          </View>
        )}

        {blocked ? (
          <View style={[styles.resultCard, styles.denyCard]}>
            <Text style={styles.denyTitle}>✕ DO NOT CHECK IN ON THIS PERMIT</Text>
            <Text style={styles.denyBody}>{blocked}</Text>
          </View>
        ) : (
          <>
            {/* ---- The ID ---- */}
            <Text style={styles.sectionTitle}>ID DOCUMENT CHECKED *</Text>

            <NeuDropdown
              label="DOCUMENT"
              options={ID_TYPES}
              selectedValue={idType || null}
              onSelect={setIdType}
              placeholder="Which document did you inspect?"
            />

            <NeuInput
              label="LAST 4 CHARACTERS OF THE ID NUMBER"
              value={idLastFour}
              onChangeText={(text) => setIdLastFour(text.toUpperCase().slice(0, 4))}
              placeholder="Optional"
              autoCapitalize="characters"
              maxLength={4}
            />

            {idPhoto ? (
              <View style={[styles.idPreviewCard, neuOutset(3, 6, Colors.neuSurface)]}>
                <Image source={{ uri: idPhoto.previewUri }} style={styles.idPreview} />
                <Pressable onPress={handleCaptureId} hitSlop={8}>
                  <Text style={styles.retakeLink}>Retake photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handleCaptureId}
                disabled={capturingId}
                style={[styles.actionButton, neuOutset(4, 8, Colors.neuSurface)]}
              >
                {capturingId ? (
                  <ActivityIndicator color={Colors.navy900} />
                ) : (
                  <>
                    <Text style={styles.actionIcon}>🪪</Text>
                    <View style={styles.actionTextBlock}>
                      <Text style={styles.actionTitle}>
                        Photograph the ID{preview?.idPhotoRequired ? ' *' : ' (optional)'}
                      </Text>
                      <Text style={styles.actionSubtitle}>
                        {preview?.idPhotoRequired
                          ? 'Required — there is no ID on file for this visitor'
                          : 'An ID is on file; a photo here is extra evidence'}
                      </Text>
                    </View>
                  </>
                )}
              </Pressable>
            )}

            {/* ---- The vehicle ---- */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>ARRIVED BY VEHICLE</Text>
              <Switch
                value={hasVehicle}
                onValueChange={setHasVehicle}
                trackColor={{ false: Colors.gray300, true: Colors.orange600 }}
                thumbColor={Colors.white}
              />
            </View>

            {hasVehicle && (
              <>
                <Pressable
                  onPress={() => setScannerOpen(true)}
                  style={[styles.actionButton, neuOutset(4, 8, Colors.neuSurface)]}
                >
                  <Icon name="camera" size={24} color={Colors.navy900} />
                  <View style={styles.actionTextBlock}>
                    <Text style={styles.actionTitle}>Scan the number plate</Text>
                    <Text style={styles.actionSubtitle}>
                      {preview?.plate
                        ? `Requested: ${preview.plate}. Scan to confirm it is the same vehicle.`
                        : 'You can still edit it afterwards.'}
                    </Text>
                  </View>
                </Pressable>

                <NeuInput
                  label="NUMBER PLATE *"
                  value={plate.value}
                  onChangeText={handleTypedPlate}
                  placeholder="AP 31 AB 1234"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={16}
                  style={styles.plateInput}
                />

                {plate.source !== 'manual' && (
                  <View style={[styles.plateMetaCard, neuInset(2, 4, '#F3F6FA')]}>
                    <Text style={styles.plateMetaLine}>
                      {plate.source === 'ocr' ? 'Read by camera' : 'Read by camera, edited by you'}
                      {plate.confidence !== null
                        ? `  ·  ${Math.round(plate.confidence * 100)}% confident`
                        : ''}
                    </Text>
                  </View>
                )}

                {preview?.plate &&
                  plate.value.replace(/\s/g, '') &&
                  plate.value.replace(/\s/g, '') !== preview.plate && (
                    <Text style={styles.warning}>
                      Not the vehicle on the request ({preview.plate}). Check before admitting.
                    </Text>
                  )}
              </>
            )}

            {/* ---- The party ---- */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>ACCOMPANYING PEOPLE ({companions.length})</Text>
              <Pressable
                onPress={() =>
                  setCompanions((rows) => [
                    ...rows,
                    { key: `${Date.now()}-${rows.length}`, name: '', relation: '' },
                  ])
                }
                hitSlop={8}
              >
                <Text style={styles.addLink}>+ Add person</Text>
              </Pressable>
            </View>

            {companions.map((companion, index) => (
              <View
                key={companion.key}
                style={[styles.companionCard, neuOutset(3, 6, Colors.neuSurface)]}
              >
                <View style={styles.companionHeader}>
                  <Text style={styles.companionIndex}>PERSON {index + 2}</Text>
                  <Pressable
                    onPress={() =>
                      setCompanions((rows) => rows.filter((row) => row.key !== companion.key))
                    }
                    hitSlop={8}
                  >
                    <Text style={styles.removeLink}>Remove</Text>
                  </Pressable>
                </View>
                <View style={styles.row}>
                  <NeuInput
                    label="NAME"
                    value={companion.name}
                    onChangeText={(text) =>
                      setCompanions((rows) =>
                        rows.map((row) => (row.key === companion.key ? { ...row, name: text } : row))
                      )
                    }
                    placeholder="Full name"
                    autoCapitalize="words"
                    containerStyle={styles.rowItem}
                  />
                  <NeuInput
                    label="RELATION"
                    value={companion.relation}
                    onChangeText={(text) =>
                      setCompanions((rows) =>
                        rows.map((row) =>
                          row.key === companion.key ? { ...row, relation: text } : row
                        )
                      )
                    }
                    placeholder="e.g. spouse"
                    containerStyle={styles.rowItem}
                  />
                </View>
              </View>
            ))}

            <NeuDropdown label="GATE" options={GATES} selectedValue={gate} onSelect={setGate} />

            {error && <Text style={styles.error}>{error}</Text>}

            {watchlistMatches.length > 0 ? (
              <WatchlistAlert
                matches={watchlistMatches}
                busy={submitting}
                error={watchlistError}
                onDeny={handleDeny}
                onAdmit={(reason) => handleCheckIn(reason)}
              />
            ) : (
              <NeuButton
                title="Check in"
                variant="accent"
                size="lg"
                fullWidth
                loading={submitting}
                onPress={() => handleCheckIn()}
                style={styles.submit}
              />
            )}
          </>
        )}

        <Pressable onPress={() => router.back()} style={styles.cancelLink}>
          <Text style={styles.cancelText}>{blocked ? 'Back to the scanner' : 'Cancel'}</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        {scannerOpen && (
          <PlateScanner onAccept={handleScannedPlate} onCancel={() => setScannerOpen(false)} />
        )}
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['3xl'],
    gap: Spacing.md,
  },
  header: { gap: 4, marginBottom: Spacing.xs },
  badge: { ...Typography.tiny, color: Colors.orange600, fontWeight: '800', letterSpacing: 1 },
  title: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  subtitle: { ...Typography.bodySm, color: Colors.gray600 },

  visitorCard: { padding: Spacing.lg, borderRadius: Radius.xl, gap: Spacing.sm },
  visitorRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  // Large on purpose: this is the face the officer compares with the person at the barrier.
  photo: { width: 96, height: 96, borderRadius: Radius.lg, backgroundColor: Colors.gray100 },
  photoMissing: { alignItems: 'center', justifyContent: 'center' },
  photoMissingText: { ...Typography.tiny, color: Colors.gray500, textAlign: 'center' },
  visitorText: { flex: 1, gap: 2 },
  visitorName: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800' },
  visitorMeta: { ...Typography.caption, color: Colors.gray600 },
  permitId: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  divider: { height: 1, backgroundColor: Colors.gray200, marginVertical: Spacing.xs },
  detail: { gap: 1 },
  detailLabel: { ...Typography.tiny, color: Colors.gray500, letterSpacing: 0.5 },
  detailValue: { ...Typography.bodySm, color: Colors.gray900, fontWeight: '700' },

  sectionTitle: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginTop: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  addLink: { ...Typography.caption, color: Colors.orange600, fontWeight: '800' },
  removeLink: { ...Typography.tiny, color: Colors.red600, fontWeight: '700' },

  row: { flexDirection: 'row', gap: Spacing.md },
  rowItem: { flex: 1 },

  companionCard: { padding: Spacing.md, borderRadius: Radius.lg, gap: Spacing.sm },
  companionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  companionIndex: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
    minHeight: 78,
  },
  actionTextBlock: { flex: 1, gap: 2 },
  actionTitle: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '800' },
  actionSubtitle: { ...Typography.tiny, color: Colors.gray500, lineHeight: 15 },

  plateInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 20,
    letterSpacing: 2,
    fontWeight: '700',
  },
  plateMetaCard: { padding: Spacing.sm, borderRadius: Radius.md, gap: 2 },
  plateMetaLine: { ...Typography.tiny, color: Colors.gray600 },
  warning: { ...Typography.caption, color: Colors.orange600 },

  idPreviewCard: {
    padding: Spacing.md,
    borderRadius: Radius.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  idPreview: {
    width: '100%',
    height: 180,
    borderRadius: Radius.lg,
    resizeMode: 'cover',
    backgroundColor: Colors.gray100,
  },
  retakeLink: { ...Typography.caption, color: Colors.navy900, fontWeight: '800' },

  resultCard: { padding: Spacing.lg, borderRadius: Radius.xl, gap: 4, alignSelf: 'stretch' },
  okCard: { backgroundColor: '#E6F6EC' },
  denyCard: { backgroundColor: '#FDE4E4' },
  okTitle: { ...Typography.tiny, color: Colors.green600, fontWeight: '800', letterSpacing: 1 },
  okBody: { ...Typography.bodySm, color: Colors.green600, fontWeight: '700', marginTop: 4 },
  denyTitle: { ...Typography.bodyMd, color: Colors.red600, fontWeight: '800', letterSpacing: 0.5 },
  denyBody: { ...Typography.bodySm, color: Colors.red600, fontWeight: '700', marginTop: 4, lineHeight: 19 },
  resultName: { ...Typography.headlineSm, color: Colors.navy900, fontWeight: '800' },
  resultMeta: { ...Typography.caption, color: Colors.gray600 },

  error: { ...Typography.caption, color: Colors.red600 },
  submit: { marginTop: Spacing.md },
  cancelLink: { alignItems: 'center', paddingVertical: Spacing.md },
  cancelText: { ...Typography.bodySm, color: Colors.gray600 },
});
