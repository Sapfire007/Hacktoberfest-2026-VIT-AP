/**
 * PlateScanner — shared number plate scanner (camera + ANPR service).
 *
 * Used by the security gate's registration form and the visitor's Add Vehicle screen.
 * It knows nothing about either: it captures, reads, and hands the accepted plate to
 * `onAccept`. Where the plate goes next is the caller's business.
 *
 * The officer takes **one photo**. It is resized, sent to the ANPR service as base64, and
 * every plate found in it comes back. The largest is offered first; any others (a second
 * vehicle in shot) are listed so the officer can pick the right one.
 *
 * **The result is a suggestion.** It is written into the draft, the officer returns to a
 * form where the plate sits in an ordinary editable text field, and any keystroke marks it
 * `ocr_edited` for the audit trail. Nothing here can produce a plate the officer cannot
 * change — which is the point. A recogniser that cannot be overridden is worse than none,
 * because a wrong plate that cannot be corrected stops a vehicle leaving.
 */

import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { anprAPI, ReadResult } from '@/services/anpr.api';

type Phase = 'idle' | 'capturing' | 'reading' | 'result' | 'error';

export interface AcceptedPlate {
  plate: string;
  display: string;
  confidence: number;
  formatValid: boolean;
}

interface PlateScannerProps {
  onAccept: (result: AcceptedPlate) => void;
  onCancel: () => void;
}

export function PlateScanner({ onAccept, onCancel }: PlateScannerProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // On a real device the preview takes a moment to start, and takePictureAsync called
  // before onCameraReady rejects. Scanning is disabled until then.
  const [cameraReady, setCameraReady] = useState(false);

  const handleScan = useCallback(async () => {
    if (!cameraRef.current || !cameraReady) return;

    setError(null);
    setResult(null);
    setPhase('capturing');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        // skipProcessing is deliberately OFF. With it on, many Android phones (Samsung
        // among them) return photos rotated 90-270 degrees, and a sideways plate is one
        // the detector does not find.
        shutterSound: false,
      });

      if (!photo?.uri) {
        setPhase('error');
        setError('The camera returned no photo. Try again.');
        return;
      }

      // Phone cameras shoot 12-50 MP. Plates read fine at 1280px, and the smaller image
      // uploads in a fraction of the time. Resizing also bakes in the orientation.
      const resized = await manipulateAsync(photo.uri, [{ resize: { width: 1280 } }], {
        compress: 0.8,
        format: SaveFormat.JPEG,
        base64: true,
      });

      if (!resized.base64) {
        setPhase('error');
        setError('The photo could not be processed. Try again.');
        return;
      }

      setPhase('reading');

      const read = await anprAPI.readImageBase64(resized.base64);

      if (!read.success || !read.best) {
        setPhase('error');
        setError(read.message || 'No plate could be read. Try again, or type it in.');
        return;
      }

      setResult(read);
      setPhase('result');
    } catch (err) {
      setPhase('error');
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reach the plate reader. Type the plate in by hand.'
      );
    }
  }, [cameraReady]);

  const accept = (plate: string, display: string, confidence: number, formatValid: boolean) => {
    onAccept({ plate, display, confidence, formatValid });
  };

  // ---- Permission states ----

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
          The plate reader uses the camera. You can always type the plate in by hand
          instead.
        </Text>
        <NeuButton title="Allow camera" variant="accent" size="md" onPress={requestPermission} />
        <Pressable onPress={onCancel} style={styles.cancelLink}>
          <Text style={styles.cancelText}>Type it in instead</Text>
        </Pressable>
      </View>
    );
  }

  const busy = phase === 'capturing' || phase === 'reading';

  return (
    <View style={styles.container}>
      <View style={styles.camera}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />
        {/* Corner brackets, not a plate-shaped box. Indian plates are either long single-row
            (cars) or near-square two-row (bikes, autos, trucks), and a fixed 4.5:1 box made
            officers back away to fit a square plate into it. The guide is only a hint to get
            close: the whole photo is sent, and the detector finds the plate anywhere in it.
            A sibling layered on top, not a child: CameraView does not support children. */}
        <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none">
          <View style={styles.guide}>
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
          <Text style={styles.guideHint}>
            {cameraReady
              ? 'Get close so the plate is large in the frame, then tap Take photo'
              : 'Starting camera…'}
          </Text>
        </View>
      </View>

      <View style={styles.panel}>
        {phase === 'capturing' && <Text style={styles.status}>Taking the photo…</Text>}

        {phase === 'reading' && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Colors.navy900} />
            <Text style={styles.status}>Reading the plate…</Text>
          </View>
        )}

        {phase === 'error' && error && (
          <View style={[styles.errorCard, neuOutset(2, 5, '#FDECEC')]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {phase === 'result' && result?.best && (
          <View style={styles.resultBlock}>
            <Text style={styles.resultLabel}>READ</Text>
            <Text style={styles.resultPlate}>{result.best.display}</Text>

            <Text style={styles.resultMeta}>
              {Math.round(result.best.confidence * 100)}% confident ·{' '}
              {Math.round(result.processing_ms)} ms
            </Text>

            {!result.best.format_valid && (
              <Text style={styles.warning}>
                Not a standard Indian plate format — check it carefully.
              </Text>
            )}

            {result.best.low_confidence && (
              <Text style={styles.warning}>
                Low confidence — check it against the plate before using it.
              </Text>
            )}

            {/*
              Other readable plates in the same photo, e.g. a car queued behind. The largest
              is offered first; the officer can pick another if that one was not the vehicle.
            */}
            {result.plates.filter((plate) => plate.plate).length > 1 && (
              <View style={styles.candidateBlock}>
                <Text style={styles.candidateLabel}>OTHER PLATES IN THE PHOTO</Text>
                {result.plates
                  .filter((plate) => plate.plate && plate.plate !== result.best!.plate)
                  .slice(0, 3)
                  .map((candidate) => (
                    <Pressable
                      key={candidate.plate}
                      onPress={() =>
                        accept(
                          candidate.plate,
                          candidate.display,
                          candidate.confidence,
                          candidate.format_valid
                        )
                      }
                      style={[styles.candidateRow, neuOutset(2, 4, Colors.neuSurface)]}
                    >
                      <Text style={styles.candidatePlate}>{candidate.display}</Text>
                      <Text style={styles.candidateVotes}>
                        {Math.round(candidate.confidence * 100)}%
                      </Text>
                    </Pressable>
                  ))}
              </View>
            )}

            <NeuButton
              title="Use this plate"
              variant="accent"
              size="lg"
              fullWidth
              onPress={() =>
                accept(
                  result.best!.plate,
                  result.best!.display,
                  result.best!.confidence,
                  result.best!.format_valid
                )
              }
            />
          </View>
        )}

        {(phase === 'idle' || phase === 'error' || phase === 'result') && (
          <NeuButton
            title={phase === 'idle' ? 'Take photo' : 'Take another photo'}
            variant="primary"
            size="lg"
            fullWidth
            disabled={!cameraReady}
            onPress={handleScan}
            style={styles.scanAgain}
          />
        )}

        {busy && <View style={styles.busySpacer} />}

        <Pressable onPress={onCancel} disabled={busy} style={styles.cancelLink}>
          <Text style={styles.cancelText}>
            {phase === 'result' ? 'Discard and type it in' : 'Cancel — type it in instead'}
          </Text>
        </Pressable>
      </View>
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
  overlay: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  guide: {
    // Roughly square and generous, so single-row and two-row plates both fit naturally.
    width: '78%',
    aspectRatio: 1.4,
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: Colors.orange600,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: Radius.md,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: Radius.md,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: Radius.md,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: Radius.md,
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

  panel: {
    backgroundColor: Colors.neuBackground,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  status: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '700' },

  errorCard: { padding: Spacing.md, borderRadius: Radius.lg },
  errorText: { ...Typography.caption, color: Colors.red600, lineHeight: 18 },

  resultBlock: { gap: Spacing.xs },
  resultLabel: {
    ...Typography.tiny,
    color: Colors.gray600,
    fontWeight: '800',
    letterSpacing: 1,
  },
  resultPlate: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: Colors.navy900,
    letterSpacing: 2,
  },
  resultMeta: { ...Typography.tiny, color: Colors.gray500 },
  warning: { ...Typography.caption, color: Colors.orange600 },

  candidateBlock: { gap: 6, marginTop: Spacing.sm },
  candidateLabel: { ...Typography.tiny, color: Colors.gray500, letterSpacing: 0.5 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  candidatePlate: { ...Typography.bodySm, color: Colors.navy900, fontWeight: '700' },
  candidateVotes: { ...Typography.tiny, color: Colors.gray500 },

  scanAgain: { marginTop: Spacing.xs },
  busySpacer: { height: 48 },
  cancelLink: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelText: { ...Typography.bodySm, color: Colors.gray600 },
});
