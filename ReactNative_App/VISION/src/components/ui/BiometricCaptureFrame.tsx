/**
 * BiometricCaptureFrame — Oval Face Guide Frame Component
 * 
 * Renders live front/selfie camera viewport with centered oval guide frame,
 * ring animation state (gray/amber/green), and guidance overlay.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { Icon } from '@/components/ui/Icon';

export type FrameState = 'idle' | 'adjust' | 'aligned' | 'complete';

interface BiometricCaptureFrameProps {
  state: FrameState;
  instructionText: string;
  subText?: string;
  systemStatusText?: string;
  previewImageUri?: string;
  onCameraReady?: () => void;
}

const stateBorderColors: Record<FrameState, string> = {
  idle: Colors.gray400,
  adjust: Colors.orange500,
  aligned: Colors.green600,
  complete: Colors.green600,
};

export function BiometricCaptureFrame({
  state,
  instructionText,
  subText = 'Position your face within the frame',
  systemStatusText = 'System Status: Online',
  previewImageUri,
  onCameraReady,
}: BiometricCaptureFrameProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const borderColor = stateBorderColors[state];
  const faceUri = previewImageUri || 'https://picsum.photos/id/64/400/600';

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const hasCamera = permission?.granted;

  return (
    <View style={styles.container}>
      {/* Live Front Camera Stream or Fallback Simulation */}
      {hasCamera ? (
        <CameraView
          facing="front"
          style={StyleSheet.absoluteFill}
          onCameraReady={onCameraReady}
        />
      ) : (
        <Image source={{ uri: faceUri }} style={styles.cameraBackground} />
      )}

      {/* Darkened Screen Mask for Focus */}
      <View style={styles.darkOverlay} />

      {/* Camera Permission Overlay if needed */}
      {!hasCamera && permission && (
        <Pressable onPress={() => requestPermission()} style={styles.permissionBadge}>
          <Icon name="camera" size={16} color={Colors.white} />
          <Text style={styles.permissionText}>Tap to Enable Selfie Camera</Text>
        </Pressable>
      )}

      {/* Centered Guide Content */}
      <View style={styles.centerContent} pointerEvents="none">
        <Text style={styles.instructionHeader}>{instructionText}</Text>
        <Text style={styles.subText}>{subText}</Text>

        {/* Centered Oval Face Frame */}
        <View style={[styles.ovalFrame, { borderColor }]}>
          <View style={styles.ovalInnerRing} />
        </View>
      </View>

      {/* System Status Pill at Bottom */}
      <View style={styles.statusPill}>
        <View style={styles.greenDot} />
        <Text style={styles.statusText}>{hasCamera ? 'Live Camera • Online' : systemStatusText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 480,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.navy900,
  },
  cameraBackground: {
    ...StyleSheet.absoluteFill,
    resizeMode: 'cover',
    opacity: 0.85,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 37, 69, 0.45)',
  },
  permissionBadge: {
    position: 'absolute',
    top: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.orange600,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    zIndex: 20,
  },
  permissionText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: '700',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    zIndex: 10,
  },
  instructionHeader: {
    ...Typography.headlineLgMobile,
    color: Colors.white,
    textAlign: 'center',
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subText: {
    ...Typography.bodyMd,
    color: Colors.gray200,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  ovalFrame: {
    width: 250,
    height: 330,
    borderRadius: 125,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  ovalInnerRing: {
    width: 234,
    height: 314,
    borderRadius: 117,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderStyle: 'dashed',
  },
  statusPill: {
    position: 'absolute',
    bottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 45, 82, 0.85)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.green600,
  },
  statusText: {
    ...Typography.tiny,
    color: Colors.white,
    fontWeight: '600',
  },
});
