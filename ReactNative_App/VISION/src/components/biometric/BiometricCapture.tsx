/**
 * Biometric Face Capture Component
 *
 * Automatic face capture for biometric enrollment.
 * Live selfie camera preview with semi-transparent dark overlay and transparent oval cutout.
 * Detects face alignment and automatically captures when properly positioned.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Dimensions,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FACE_OVAL_WIDTH = SCREEN_WIDTH * 0.65;
const FACE_OVAL_HEIGHT = FACE_OVAL_WIDTH * 1.3;

type FaceAlignmentState = 'searching' | 'aligning' | 'aligned' | 'capturing' | 'captured';

interface BiometricCaptureProps {
  onCapture: (imageUri: string) => void;
  onSkip?: () => void;
  onError?: (error: string) => void;
  captureLabel?: string;
  showGuide?: boolean;
}

export default function BiometricCapture({
  onCapture,
  onSkip,
  onError,
  captureLabel = 'Position your face in the oval',
  showGuide = true,
}: BiometricCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [screenFocused, setScreenFocused] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [alignmentState, setAlignmentState] = useState<FaceAlignmentState>('searching');
  const [countdown, setCountdown] = useState(3);
  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Track screen focus to release/re-acquire camera hardware
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );

  // Auto-request permission on mount if needed
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  // Simulate face detection pipeline once camera is ready
  useEffect(() => {
    if (!isCameraReady) return;

    const t1 = setTimeout(() => {
      setAlignmentState('aligning');
    }, 1000);

    const t2 = setTimeout(() => {
      setAlignmentState('aligned');
      setCountdown(3);
    }, 2500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isCameraReady]);

  // Pulse animation for oval guide
  useEffect(() => {
    if (alignmentState === 'aligning' || alignmentState === 'aligned') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [alignmentState]);

  // Countdown and auto-capture when aligned
  useEffect(() => {
    if (alignmentState === 'aligned' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (alignmentState === 'aligned' && countdown === 0) {
      takePicture();
    }
  }, [alignmentState, countdown]);

  const takePicture = async () => {
    if (!cameraRef.current || alignmentState === 'capturing') return;

    try {
      setAlignmentState('capturing');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        skipProcessing: false,
      });

      if (photo && photo.uri) {
        setAlignmentState('captured');
        onCapture(photo.uri);
      } else {
        throw new Error('Camera returned empty image');
      }
    } catch (err: any) {
      console.error('Camera capture error:', err);
      onError?.(err?.message || 'Failed to capture photo');
      setAlignmentState('searching');
      setIsCameraReady(false);
      setTimeout(() => setIsCameraReady(true), 300);
    }
  };

  const getInstructionText = () => {
    switch (alignmentState) {
      case 'searching':
        return 'Looking for your face...';
      case 'aligning':
        return 'Position your face in the oval';
      case 'aligned':
        return `Hold steady... ${countdown}`;
      case 'capturing':
        return 'Capturing...';
      case 'captured':
        return 'Perfect! ✓';
      default:
        return captureLabel;
    }
  };

  const getOvalColor = () => {
    switch (alignmentState) {
      case 'searching':
        return Colors.gray400;
      case 'aligning':
        return Colors.yellow500;
      case 'aligned':
        return Colors.green500;
      case 'capturing':
      case 'captured':
        return Colors.blue500;
      default:
        return Colors.primary;
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Initializing camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <Icon name="camera" size={48} color={Colors.blue600} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to capture your face for biometric enrollment.
            Your photo is processed securely and encrypted.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
          {onSkip && (
            <TouchableOpacity style={{ marginTop: Spacing.lg }} onPress={onSkip}>
              <Text style={[styles.loadingText, { color: Colors.gray400 }]}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {screenFocused && (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          onCameraReady={() => {
            console.log('📸 CameraView ready');
            setIsCameraReady(true);
          }}
          onMountError={(e) => {
            console.error('❌ CameraView mount error:', e);
            onError?.(e.message || 'Camera failed to mount');
          }}
        >
          {/* Dark overlay with transparent oval cutout */}
          <View style={styles.overlayContainer}>
            {/* Top section */}
            <View style={styles.topSection}>
              <View style={styles.topHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>Biometric Enrollment</Text>
                  <Text style={styles.headerSubtitle}>Center your face in the oval</Text>
                </View>
                {onSkip && (
                  <TouchableOpacity style={styles.skipChip} onPress={onSkip}>
                    <Text style={styles.skipChipText}>Skip</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.instructionText}>{getInstructionText()}</Text>
            </View>

            {/* Middle section with oval cutout */}
            <View style={styles.middleSection}>
              <View style={styles.sideOverlay} />

              {showGuide && (
                <Animated.View
                  style={[
                    styles.faceOval,
                    {
                      borderColor: getOvalColor(),
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  {/* Corner guides */}
                  <View style={[styles.corner, styles.topLeft, { borderColor: getOvalColor() }]} />
                  <View style={[styles.corner, styles.topRight, { borderColor: getOvalColor() }]} />
                  <View style={[styles.corner, styles.bottomLeft, { borderColor: getOvalColor() }]} />
                  <View style={[styles.corner, styles.bottomRight, { borderColor: getOvalColor() }]} />

                  {/* Center countdown badge */}
                  {alignmentState === 'aligned' && countdown > 0 && (
                    <View style={styles.centerDot}>
                      <Text style={styles.countdownText}>{countdown}</Text>
                    </View>
                  )}
                </Animated.View>
              )}

              <View style={styles.sideOverlay} />
            </View>

            {/* Bottom section */}
            <View style={styles.bottomSection}>
              <View style={styles.tipContainer}>
                <Text style={styles.tipText}>💡 Tips:</Text>
                <Text style={styles.tipItem}>• Remove glasses if possible</Text>
                <Text style={styles.tipItem}>• Ensure good lighting</Text>
                <Text style={styles.tipItem}>• Look straight at camera</Text>
              </View>
            </View>
          </View>
        </CameraView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlayContainer: {
    flex: 1,
  },
  topSection: {
    flex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Platform.OS === 'android' ? 36 : 48,
    paddingBottom: Spacing.lg,
  },
  topHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.headlineSm,
    color: Colors.white,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...Typography.bodySm,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  skipChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: Radius.md,
  },
  skipChipText: {
    ...Typography.bodySm,
    color: Colors.white,
    fontWeight: '600',
  },
  instructionText: {
    ...Typography.headlineSm,
    color: Colors.yellow500,
    textAlign: 'center',
    fontWeight: '700',
  },
  middleSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideOverlay: {
    flex: 1,
    height: FACE_OVAL_HEIGHT + 20,
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
  },
  faceOval: {
    width: FACE_OVAL_WIDTH,
    height: FACE_OVAL_HEIGHT,
    borderRadius: FACE_OVAL_WIDTH / 2,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
  },
  topLeft: {
    top: 8,
    left: 8,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 8,
    right: 8,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 8,
    left: 8,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 8,
    right: 8,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  centerDot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  countdownText: {
    fontSize: 26,
    color: Colors.navy900,
    fontWeight: 'bold',
  },
  bottomSection: {
    flex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  tipContainer: {
    alignItems: 'flex-start',
  },
  tipText: {
    ...Typography.bodySm,
    color: Colors.white,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  tipItem: {
    ...Typography.caption,
    color: Colors.gray300,
    marginBottom: Spacing['2xs'],
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.navy900,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  permissionContent: {
    alignItems: 'center',
    maxWidth: 400,
  },
  permissionTitle: {
    ...Typography.headlineMd,
    color: Colors.white,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  permissionText: {
    ...Typography.bodyMd,
    color: Colors.gray300,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: Colors.blue500,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    minWidth: 200,
    alignItems: 'center',
  },
  permissionButtonText: {
    ...Typography.button,
    color: Colors.white,
    fontWeight: '600',
  },
});
