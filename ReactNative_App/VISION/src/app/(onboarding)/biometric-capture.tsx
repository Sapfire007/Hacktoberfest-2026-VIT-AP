/**
 * Biometric Capture Screen
 * 
 * Captures face image for biometric enrollment during registration.
 * Uses real camera to capture frontal face automatically.
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import BiometricCapture from '@/components/biometric/BiometricCapture';
import { BIOMETRIC_API_BASE_URL } from '@/config/backend';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius } from '@/constants/neumorphic';
import { useAuth, homeRouteForRole } from '@/context/AuthContext';

export default function BiometricCaptureScreen() {
  const router = useRouter();
  const { user, role, pendingRole, completeBiometricEnrollment, syncBiometricsToFirebase, getIdToken } = useAuth();

  const goHome = () => router.replace(homeRouteForRole(role ?? pendingRole) as never);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(true);

  const handleCapture = (imageUri: string) => {
    console.log('📸 Captured image:', imageUri);
    setCapturedImage(imageUri);
    setShowCamera(false);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setShowCamera(true);
  };

  const getUserId = () => user?.id || (user as any)?.uid || '';

  const uploadMultipartImage = async (
    apiUrl: string,
    imageUri: string,
    userId: string,
  ): Promise<{ status: number; body: string }> => {
    // The biometric service accepts only the signed-in user's own face, and checks who that
    // is from this token (via Node_Backend).
    const authorization = `Bearer ${await getIdToken()}`;

    if (Platform.OS !== 'web') {
      console.log('📤 Using FileSystem.uploadAsync for native upload:', { apiUrl, imageUri, userId });
      // FileSystemUploadType.MULTIPART has value 1 in Expo FileSystem native module
      const uploadType = (FileSystem as any).FileSystemUploadType?.MULTIPART ?? (FileSystem as any).UploadType?.MULTIPART ?? 1;
      const uploadRes = await FileSystem.uploadAsync(apiUrl, imageUri, {
        httpMethod: 'POST',
        uploadType,
        fieldName: 'images',
        parameters: {
          user_id: userId,
          consent_given: 'true',
        },
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
        },
      });
      return { status: uploadRes.status, body: uploadRes.body };
    }

    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const formData = new FormData();
    const response = await fetch(imageUri);
    const blob = await response.blob();
    formData.append('images', blob, filename);
    formData.append('user_id', userId);
    formData.append('consent_given', 'true');

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: authorization },
      body: formData,
    });

    const text = await res.text();
    return { status: res.status, body: text };
  };

  const reEnroll = async () => {
    const userId = getUserId();
    if (!userId || !capturedImage) return;
    setIsUploading(true);
    try {
    const apiUrl = `${BIOMETRIC_API_BASE_URL}/biometric/re-enroll`;

      const uploadResult = await uploadMultipartImage(apiUrl, capturedImage, userId);

      let result: any = null;
      try {
        result = JSON.parse(uploadResult.body);
      } catch (e) {
        result = { success: uploadResult.status === 200 || uploadResult.status === 201, rawBody: uploadResult.body };
      }

      if ((uploadResult.status === 200 || uploadResult.status === 201) && (result.success || result.status === 'success')) {
        // Persist encrypted embedding to Cloud Firestore
        if (result.encrypted_embedding) {
          try {
            await syncBiometricsToFirebase({
              encryptedEmbedding: result.encrypted_embedding,
              modelName: result.model_name || 'VGG-Face',
              detectorBackend: result.detector_backend || 'opencv',
              embeddingDimensions: result.embedding_dimensions || 4096,
              facesProcessed: result.faces_processed || 1,
            });
            console.log('✅ Re-enrolled biometric data synced to Cloud Firestore');
          } catch (syncErr) {
            console.error('⚠️ Could not sync re-enrolled biometrics to Firebase:', syncErr);
          }
        }

        completeBiometricEnrollment();
        Alert.alert('Success', 'Biometric re-enrollment completed!', [
          { text: 'Continue', onPress: goHome },
        ]);
      } else {
        const errorMsg =
          result?.error?.message ||
          result?.detail?.error?.message ||
          result?.detail?.message ||
          result?.detail ||
          result?.message ||
          result?.rawBody ||
          'Re-enrollment failed';
        console.error('❌ Re-enroll error:', { status: uploadResult.status, body: uploadResult.body });
        Alert.alert('Re-enroll Failed', typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg), [{ text: 'OK' }]);
      }
    } catch (err: any) {
      console.error('❌ Re-enroll exception:', err);
      Alert.alert('Error', err?.message || 'Re-enroll failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    const userId = getUserId();
    if (!userId) {
      Alert.alert('Error', 'User session not ready yet. Please sign in again and retry.');
      return;
    }

    if (!capturedImage) {
      Alert.alert('Error', 'No image captured');
      return;
    }

    try {
      setIsUploading(true);

      console.log('📤 Preparing biometric data for user:', userId);
      console.log('📸 Image URI:', capturedImage);

      // Upload using a platform-specific approach: use expo FileSystem on native,
      // and FormData+fetch on web where uploadAsync is not available.
      try {
        console.log('📤 Uploading to backend...');

        const apiUrl = `${BIOMETRIC_API_BASE_URL}/biometric/enroll`;

        const uploadResult = await uploadMultipartImage(apiUrl, capturedImage, userId);

        console.log('📥 Upload response status:', uploadResult.status);
        console.log('📥 Upload response body:', uploadResult.body);

        let result: any = null;
        try {
          result = JSON.parse(uploadResult.body);
        } catch (e) {
          console.warn('⚠️ Upload response is not valid JSON; using raw body for diagnostics');
          result = { success: uploadResult.status === 200 || uploadResult.status === 201, rawBody: uploadResult.body };
        }

        if ((uploadResult.status === 200 || uploadResult.status === 201) && (result.success || result.status === 'success')) {
          // Persist encrypted embedding & metadata to Cloud Firestore
          if (result.encrypted_embedding) {
            try {
              console.log('☁️ Persisting biometric data to Cloud Firestore...');
              await syncBiometricsToFirebase({
                encryptedEmbedding: result.encrypted_embedding,
                modelName: result.model_name || 'VGG-Face',
                detectorBackend: result.detector_backend || 'opencv',
                embeddingDimensions: result.embedding_dimensions || 4096,
                facesProcessed: result.faces_processed || 1,
              });
              console.log('✅ Biometric vector successfully synced to Cloud Firestore!');
            } catch (syncErr) {
              console.error('⚠️ Could not sync biometrics to Firebase:', syncErr);
            }
          }

          completeBiometricEnrollment();

          Alert.alert('Success', 'Biometric enrollment completed successfully!', [
            {
              text: 'Continue',
              onPress: () => {
                router.replace('/(onboarding)/done');
              },
            },
          ]);
        } else if (uploadResult.status === 409 || result?.error?.error_code === 'ALREADY_ENROLLED' || result?.detail?.error?.error_code === 'ALREADY_ENROLLED') {
          // User is already enrolled — offer re-enroll or proceed
          Alert.alert(
            'Already Enrolled',
            'Your biometric profile is already registered. Would you like to update your biometric data or continue to Home?',
            [
              {
                text: 'Update (Re-Enroll)',
                onPress: () => reEnroll(),
              },
              {
                text: 'Continue to Home',
                onPress: () => {
                  completeBiometricEnrollment();
                  goHome();
                },
              },
            ]
          );
        } else {
          const errorMsg =
            result?.error?.message ||
            result?.detail?.error?.message ||
            result?.detail?.message ||
            result?.detail ||
            result?.message ||
            result?.rawBody ||
            'Enrollment failed';
          const guidance = result?.error?.guidance || result?.detail?.error?.guidance;
          const displayMsg = guidance ? `${errorMsg}\n\n💡 ${guidance}` : (typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));

          console.error('❌ Backend error:', { status: uploadResult.status, body: uploadResult.body });
          Alert.alert('Enrollment Failed', displayMsg, [
            {
              text: 'Retry',
              onPress: handleRetake,
            },
            {
              text: 'Skip',
              onPress: () => handleSkip(),
              style: 'cancel',
            },
          ]);
        }
      } catch (uploadError: any) {
        console.error('❌ Upload error:', uploadError);
        throw new Error(`Failed to upload: ${uploadError?.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('❌ Biometric enrollment error:', error);
      const errorMessage = error?.message || error?.toString() || 'Failed to enroll biometric data';
      Alert.alert(
        'Error',
        errorMessage,
        [
          {
            text: 'Retry',
            onPress: handleRetake,
          },
          {
            text: 'Skip',
            onPress: () => handleSkip(),
            style: 'cancel',
          },
        ]
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Biometric Enrollment?',
      'You can enroll your biometric data later from your profile.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Skip',
          onPress: () => {
            // Home for the role the account actually has, not the one picked during
            // onboarding (which is stale after a relaunch).
            goHome();
          },
        },
      ]
    );
  };

  if (showCamera) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <BiometricCapture
          onCapture={handleCapture}
          onSkip={handleSkip}
          onError={(error) => {
            console.error('Camera error:', error);
            Alert.alert('Camera Error', error);
          }}
          captureLabel="Position your face in the oval"
          showGuide={true}
        />
      </View>
    );
  }

  // Review and submit screen
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView contentContainerStyle={styles.reviewContainer}>
        <Text style={styles.reviewTitle}>Review Your Photo</Text>
        <Text style={styles.reviewDescription}>
          Make sure your face is clearly visible.
        </Text>

        {capturedImage && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: capturedImage }} style={styles.capturedImage} />
          </View>
        )}

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.button, styles.retakeButton]}
            onPress={handleRetake}
            disabled={isUploading}
          >
            <Text style={styles.retakeButtonText}>Retake Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Complete Enrollment</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleSkip} disabled={isUploading}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray900,
  },
  headerOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  stepTitle: {
    ...Typography.headlineSm,
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  stepCounter: {
    ...Typography.bodySm,
    color: Colors.gray300,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: Spacing.xl,
  },
  skipButtonText: {
    ...Typography.bodyMd,
    color: Colors.white,
    fontWeight: '600',
  },
  reviewContainer: {
    flexGrow: 1,
    backgroundColor: Colors.white,
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  reviewTitle: {
    ...Typography.headlineLg,
    color: Colors.navy900,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  reviewDescription: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  capturedImage: {
    width: 280,
    height: 350,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.blue500,
  },
  buttonGroup: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  button: {
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  retakeButton: {
    backgroundColor: Colors.gray200,
  },
  retakeButtonText: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: Colors.blue500,
  },
  submitButtonText: {
    ...Typography.bodyMd,
    color: Colors.white,
    fontWeight: '600',
  },
  skipText: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
  },
});
