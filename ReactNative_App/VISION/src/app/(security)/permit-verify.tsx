/**
 * Security Permit Verification Screen
 * 
 * Security officer verifies visitor's biometric against Firestore data,
 * reviews approved permit details, and activates the QR code.
 */

import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert, Modal, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/ui/Icon';

interface ApprovedRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterPhone: string;
  requesterEmail: string;
  requesterPhotoURL?: string;
  identityDocument?: string; // base64 encoded image
  identityDocumentType?: string;
  destination: string;
  purpose: string;
  visitDate: string;
  timeWindow: string;
  visitStartAt: string;
  visitEndAt: string;
  targetFacultyName: string;
  targetFacultyPhotoURL?: string;
  facultyRemarks?: string;
  status: 'approved';
}

type VerificationStep = 'input' | 'camera' | 'verifying' | 'success' | 'failed' | 'vehicle-prompt' | 'vehicle-camera' | 'vehicle-processing' | 'vehicle-confirm';

export default function PermitVerificationScreen() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [requestId, setRequestId] = useState('');
  
  // Step 2: Verification flow
  const [step, setStep] = useState<VerificationStep>('input');
  const [cameraReady, setCameraReady] = useState(false);
  const [approvedRequest, setApprovedRequest] = useState<ApprovedRequest | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState('');
  
  // Vehicle registration
  const [hasVehicle, setHasVehicle] = useState<boolean | null>(null);
  const [vehiclePlateImage, setVehiclePlateImage] = useState<string | null>(null);
  const [detectedPlate, setDetectedPlate] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  
  // Full-screen image viewer
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Request camera permission
  const requestCameraPermission = async () => {
    if (!permission) {
      return false;
    }
    
    if (!permission.granted) {
      const result = await requestPermission();
      return result.granted;
    }
    
    return true;
  };

  // Step 1: Find approved request by phone or request ID
  const handleFindRequest = async () => {
    if (!phoneNumber.trim() && !requestId.trim()) {
      Alert.alert('Error', 'Please enter phone number or request ID');
      return;
    }

    try {
      const token = await getIdToken();
      
      const payload = {
        phone: phoneNumber.trim() || undefined,
        requestId: requestId.trim() || undefined,
      };
      
      console.log('🔍 Finding approved request with:', payload);
      console.log('📡 API URL:', `${process.env.EXPO_PUBLIC_API_BASE_URL}/gate/security/find-approved-request`);
      
      // Call backend to find approved request
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_BASE_URL}/gate/security/find-approved-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      
      // Debug logging
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(data, null, 2));

      if (!response.ok) {
        console.error('Backend error:', data);
        throw new Error(data.error || data.message || 'Failed to find approved request');
      }

      if (!data.success || !data.request) {
        Alert.alert('Not Found', data.message || 'No approved request found for this visitor');
        return;
      }

      console.log('✅ Approved request found:', data.request);
      console.log('📄 Identity Document present:', !!data.request.identityDocument);
      console.log('📄 Identity Document Type:', data.request.identityDocumentType);
      if (data.request.identityDocument) {
        console.log('📄 Identity Document length:', data.request.identityDocument.length);
        console.log('📄 Identity Document preview:', data.request.identityDocument.substring(0, 50) + '...');
      }

      setApprovedRequest(data.request);
      
      // Move to camera step
      const hasCamera = await requestCameraPermission();
      if (hasCamera) {
        setStep('camera');
      } else {
        Alert.alert('Camera Required', 'Camera permission is needed for biometric verification');
      }
    } catch (error) {
      console.error('Error finding request:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to find request');
    }
  };

  // Step 2: Capture photo and verify biometric
  const handleCapture = async () => {
    if (!cameraRef.current || !approvedRequest) {
      Alert.alert('Error', 'Camera reference or request data is missing');
      return;
    }
    
    if (!cameraReady) {
      Alert.alert('Camera Not Ready', 'Please wait for the camera to initialize');
      return;
    }

    try {
      // DON'T change step yet - capture photo first while camera is still mounted
      console.log('📸 Starting photo capture...');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error('Camera returned an empty image');
      }

      console.log('✅ Photo captured:', photo.uri);
      setCapturedImage(photo.uri);
      
      // NOW change step to verifying (after photo is captured)
      setStep('verifying');
      setVerificationMessage('Verifying biometric...');

      // Get auth token for Biometric_Backend
      const token = await getIdToken();

      // Prepare FormData for biometric verification
      const formData = new FormData();
      formData.append('user_id', approvedRequest.requesterId);
      
      // Create blob from file URI
      const response = await fetch(photo.uri);
      const blob = await response.blob();
      formData.append('image', blob, 'capture.jpg');

      console.log('🔐 Calling Biometric_Backend with auth token');

      // Call Biometric_Backend to verify face
      const verifyResponse = await fetch(
        `${process.env.EXPO_PUBLIC_BIOMETRIC_API_BASE_URL}/biometric/verify`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const verificationData = await verifyResponse.json();

      console.log('Biometric verification response:', verificationData);

      if (!verifyResponse.ok) {
        setStep('failed');
        // Handle 400 Bad Request (no face detected or poor quality)
        if (verifyResponse.status === 400) {
          setVerificationMessage(
            verificationData.error?.message || 
            'No valid face detected in image. Please ensure:\n• Face is clearly visible\n• Good lighting\n• No obstructions (glasses, mask, hat)\n• Camera is steady'
          );
        } else {
          setVerificationMessage(
            verificationData.error?.message || 'Verification request failed'
          );
        }
        return;
      }

      if (!verificationData.verified) {
        setStep('failed');
        const distance = verificationData.distance?.toFixed(4) || 'N/A';
        const confidence = verificationData.confidence_score?.toFixed(2) || '0.00';
        setVerificationMessage(
          `Face verification failed.\n\nDistance: ${distance} (threshold: ~0.60)\nConfidence: ${confidence}\n\nThis may not be the registered visitor, or the lighting/angle is very different from registration.`
        );
        return;
      }

      // Verification successful - go to vehicle prompt
      setStep('vehicle-prompt');
      setVerificationMessage('Biometric verified successfully!');
    } catch (error) {
      console.error('Error during verification:', error);
      setStep('failed');
      setVerificationMessage(
        error instanceof Error ? error.message : 'Verification failed'
      );
    }
  };

  // Vehicle Registration Handlers
  const handleVehicleYes = async () => {
    const hasCamera = await requestCameraPermission();
    if (hasCamera) {
      setCameraReady(false);
      setStep('vehicle-camera');
    } else {
      Alert.alert('Camera Required', 'Camera permission is needed for vehicle plate capture');
    }
  };

  const handleVehicleNo = () => {
    setHasVehicle(false);
    setVehiclePlate('');
    setStep('success');
  };

  const handleCaptureVehiclePlate = async () => {
    if (!cameraRef.current || !approvedRequest) {
      Alert.alert('Error', 'Camera reference is missing');
      return;
    }

    if (!cameraReady) {
      Alert.alert('Camera Not Ready', 'Please wait for the camera to initialize');
      return;
    }

    try {
      console.log('📸 Capturing vehicle plate...');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error('Camera returned an empty image');
      }

      console.log('✅ Vehicle photo captured:', photo.uri);
      setVehiclePlateImage(photo.uri);
      
      // Change step to processing
      setStep('vehicle-processing');
      setVerificationMessage('Reading license plate...');

      // Convert image to base64
      const response = await fetch(photo.uri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove the data:image/jpeg;base64, prefix
          const base64String = result.split(',')[1];
          resolve(base64String);
        };
        reader.readAsDataURL(blob);
      });

      console.log('🚗 Calling ANPR backend...');

      // Call ANPR backend
      const anprResponse = await fetch(
        `${process.env.EXPO_PUBLIC_ANPR_API_BASE_URL}/anpr/read-base64`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_b64: base64,
            session_id: approvedRequest.id,
          }),
        }
      );

      const anprData = await anprResponse.json();
      console.log('ANPR response:', anprData);

      if (!anprResponse.ok) {
        throw new Error(anprData.error?.message || 'Failed to read license plate');
      }

      if (anprData.candidates && anprData.candidates.length > 0) {
        const topCandidate = anprData.candidates[0];
        setDetectedPlate(topCandidate.plate);
        setVehiclePlate(topCandidate.plate);
        setStep('vehicle-confirm');
      } else {
        // No plate detected, allow manual entry
        Alert.alert(
          'No Plate Detected',
          'Could not read license plate. Please enter manually.',
          [
            {
              text: 'Enter Manually',
              onPress: () => {
                setDetectedPlate('');
                setVehiclePlate('');
                setStep('vehicle-confirm');
              },
            },
            {
              text: 'Retry',
              onPress: () => {
                setStep('vehicle-camera');
                setCameraReady(false);
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error capturing vehicle plate:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to capture vehicle plate',
        [
          {
            text: 'Retry',
            onPress: () => {
              setStep('vehicle-camera');
              setCameraReady(false);
            },
          },
          {
            text: 'Enter Manually',
            onPress: () => {
              setDetectedPlate('');
              setVehiclePlate('');
              setStep('vehicle-confirm');
            },
          },
        ]
      );
    }
  };

  const handleConfirmVehicle = () => {
    if (!vehiclePlate.trim()) {
      Alert.alert('Error', 'Please enter a vehicle plate number');
      return;
    }
    setHasVehicle(true);
    setStep('success');
  };

  const handleSkipVehicle = () => {
    setHasVehicle(false);
    setVehiclePlate('');
    setStep('success');
  };

  // Step 3: Activate permit (generate QR and change status to permit_active)
  const handleActivatePermit = async () => {
    if (!approvedRequest) return;

    try {
      const token = await getIdToken();

      const payload: any = {
        requestId: approvedRequest.id,
      };

      // Include vehicle data if visitor has vehicle
      if (hasVehicle && vehiclePlate.trim()) {
        payload.vehicleNumber = vehiclePlate.trim().toUpperCase();
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_BASE_URL}/gate/security/activate-permit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to activate permit');
      }

      const message = hasVehicle 
        ? `Permit activated with vehicle ${vehiclePlate}!\nVisitor can now see their QR code.`
        : 'Permit activated! Visitor can now see their QR code.';

      Alert.alert(
        'Success',
        message,
        [
          {
            text: 'Done',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error activating permit:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to activate permit');
    }
  };

  // Retry verification
  const handleRetry = () => {
    setCapturedImage(null);
    setVerificationMessage('');
    setStep('camera');
  };

  // Render different steps
  if (step === 'input') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.card, neuOutset(6, 12, Colors.neuSurface)]}>
            <Text style={styles.title}>Verify Approved Permit</Text>
            <Text style={styles.subtitle}>
              Enter visitor's phone number or request ID to find their approved permit
            </Text>
          </View>

          <NeuInput
            label="VISITOR PHONE NUMBER"
            value={phoneNumber}
            onChangeText={(text) => setPhoneNumber(text.replace(/[^\d+ ]/g, ''))}
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            maxLength={14}
          />

          <Text style={styles.orText}>— OR —</Text>

          <NeuInput
            label="REQUEST ID"
            value={requestId}
            onChangeText={setRequestId}
            placeholder="e.g., REQ-ABC123"
            autoCapitalize="characters"
          />

          <NeuButton
            title="Find & Verify →"
            variant="accent"
            size="lg"
            fullWidth
            onPress={handleFindRequest}
            disabled={!phoneNumber.trim() && !requestId.trim()}
          />

          <NeuButton
            title="← Back to Home"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => router.back()}
          />
        </ScrollView>
      </View>
    );
  }

  if (step === 'camera' && permission?.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
          />
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <Text style={styles.cameraTitle}>Position visitor's face</Text>
              <Text style={styles.cameraSubtitle}>
                {cameraReady 
                  ? 'Good lighting and clear visibility required'
                  : '⏳ Initializing camera... Please wait'}
              </Text>
            </View>

            <View style={styles.cameraControls}>
              <NeuButton
                title="✕ Cancel"
                variant="ghost"
                size="md"
                onPress={() => {
                  setStep('input');
                  setApprovedRequest(null);
                  setCameraReady(false);
                }}
              />
              <NeuButton
                title={cameraReady ? "📸 Capture & Verify" : "⏳ Camera Starting..."}
                variant="accent"
                size="lg"
                disabled={!cameraReady}
                onPress={handleCapture}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (step === 'verifying') {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          {capturedImage && (
            <Image source={{ uri: capturedImage }} style={styles.capturedPhoto} />
          )}
          <Text style={styles.verifyingText}>{verificationMessage}</Text>
        </View>
      </View>
    );
  }

  if (step === 'failed') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.card, neuOutset(6, 12, Colors.neuSurface)]}>
            <Icon name="error-or-rejected" size={48} color={Colors.red600} />
            <Text style={styles.failedTitle}>Verification Failed</Text>
            <Text style={styles.failedMessage}>{verificationMessage}</Text>
          </View>

          {capturedImage && (
            <Image source={{ uri: capturedImage }} style={styles.resultPhoto} />
          )}

          <NeuButton
            title="🔄 Try Again"
            variant="accent"
            size="lg"
            fullWidth
            onPress={handleRetry}
          />

          <NeuButton
            title="← Cancel"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => {
              setStep('input');
              setApprovedRequest(null);
              setCapturedImage(null);
            }}
          />
        </ScrollView>
      </View>
    );
  }

  // Vehicle Prompt Step
  if (step === 'vehicle-prompt' && approvedRequest) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Enhanced Success Header */}
          <View style={[styles.verifiedHeader, neuOutset(6, 12, Colors.neuSurface)]}>
            <View style={styles.verifiedIconContainer}>
              <View style={styles.verifiedIconCircle}>
                <Text style={styles.verifiedIconCheck}>✓</Text>
              </View>
            </View>
            <Text style={styles.verifiedTitle}>Biometric Verified</Text>
            <Text style={styles.verifiedSubtitle}>
              Face successfully matched with registered biometric data
            </Text>
            
            {/* Verification Details Badge */}
            <View style={[styles.verificationBadge, neuInset(2, 4, Colors.neuSurface)]}>
              <View style={styles.badgeRow}>
                <Icon name="profile" size={20} color={Colors.navy900} />
                <View style={styles.badgeContent}>
                  <Text style={styles.badgeLabel}>Visitor Name</Text>
                  <Text style={styles.badgeValue}>{approvedRequest.requesterName}</Text>
                </View>
              </View>
              <View style={styles.badgeDivider} />
              <View style={styles.badgeRow}>
                <Icon name="target-arrow" size={20} color={Colors.blue600} />
                <View style={styles.badgeContent}>
                  <Text style={styles.badgeLabel}>Destination</Text>
                  <Text style={styles.badgeValue}>{approvedRequest.destination}</Text>
                </View>
              </View>
              <View style={styles.badgeDivider} />
              <View style={styles.badgeRow}>
                <Text style={styles.badgeIcon}>📅</Text>
                <View style={styles.badgeContent}>
                  <Text style={styles.badgeLabel}>Visit Date & Time</Text>
                  <Text style={styles.badgeValue}>{approvedRequest.visitDate} • {approvedRequest.timeWindow}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Vehicle Question Card */}
          <View style={[styles.vehicleQuestionCard, neuOutset(4, 8, Colors.neuSurface)]}>
            <View style={styles.vehicleIconHeader}>
              <Icon name="car" size={48} color={Colors.navy900} />
            </View>
            <Text style={styles.vehicleQuestion}>Does the visitor have a vehicle?</Text>
            <Text style={styles.vehicleSubtext}>
              Register the vehicle to allow campus entry and parking
            </Text>
          </View>

          <View style={styles.vehicleActions}>
            <NeuButton
              title="Yes, Register Vehicle"
              variant="accent"
              size="lg"
              fullWidth
              onPress={handleVehicleYes}
            />

            <NeuButton
              title="🚶 No Vehicle"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={handleVehicleNo}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  // Vehicle Camera Step
  if (step === 'vehicle-camera' && permission?.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
          />
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <Text style={styles.cameraTitle}>Capture Vehicle License Plate</Text>
              <Text style={styles.cameraSubtitle}>
                {cameraReady 
                  ? 'Position license plate within frame'
                  : '⏳ Initializing camera... Please wait'}
              </Text>
              {cameraReady && (
                <View style={styles.instructionsBox}>
                  <Text style={styles.instructionText}>✓ Plate clearly visible and in focus</Text>
                  <Text style={styles.instructionText}>✓ Good lighting (no shadows)</Text>
                  <Text style={styles.instructionText}>✓ Fill frame with plate</Text>
                  <Text style={styles.instructionText}>✓ Avoid glare or reflections</Text>
                </View>
              )}
            </View>

            {/* Plate guide frame */}
            {cameraReady && (
              <View style={styles.plateGuide}>
                <View style={[styles.guideCorner, styles.topLeft]} />
                <View style={[styles.guideCorner, styles.topRight]} />
                <View style={[styles.guideCorner, styles.bottomLeft]} />
                <View style={[styles.guideCorner, styles.bottomRight]} />
              </View>
            )}

            <View style={styles.cameraControls}>
              <NeuButton
                title="✕ Skip Vehicle"
                variant="ghost"
                size="md"
                onPress={handleVehicleNo}
              />
              <NeuButton
                title={cameraReady ? "📸 Capture Plate" : "⏳ Camera Starting..."}
                variant="accent"
                size="lg"
                disabled={!cameraReady}
                onPress={handleCaptureVehiclePlate}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Vehicle Processing Step
  if (step === 'vehicle-processing') {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          {vehiclePlateImage && (
            <Image source={{ uri: vehiclePlateImage }} style={styles.capturedPhoto} />
          )}
          <Text style={styles.verifyingText}>{verificationMessage}</Text>
        </View>
      </View>
    );
  }

  // Vehicle Confirmation Step
  if (step === 'vehicle-confirm') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.card, neuOutset(6, 12, Colors.neuSurface)]}>
            <Text style={styles.title}>Confirm Vehicle Plate</Text>
            {detectedPlate ? (
              <Text style={styles.subtitle}>
                Detected plate: <Text style={styles.detectedPlateText}>{detectedPlate}</Text>
              </Text>
            ) : (
              <Text style={styles.subtitle}>Enter plate manually</Text>
            )}
          </View>

          {vehiclePlateImage && (
            <Image source={{ uri: vehiclePlateImage }} style={styles.resultPhoto} />
          )}

          <NeuInput
            label="VEHICLE PLATE NUMBER"
            value={vehiclePlate}
            onChangeText={(text) => setVehiclePlate(text.toUpperCase())}
            placeholder="e.g., ABC123 or AB01CD1234"
            autoCapitalize="characters"
          />

          <NeuButton
            title="✓ Confirm Vehicle"
            variant="accent"
            size="lg"
            fullWidth
            onPress={handleConfirmVehicle}
            disabled={!vehiclePlate.trim()}
          />

          <NeuButton
            title="🔄 Recapture"
            variant="secondary"
            size="md"
            fullWidth
            onPress={() => {
              setStep('vehicle-camera');
              setCameraReady(false);
            }}
          />

          <NeuButton
            title="Skip Vehicle Registration"
            variant="ghost"
            size="sm"
            fullWidth
            onPress={handleSkipVehicle}
          />
        </ScrollView>
      </View>
    );
  }

  if (step === 'success' && approvedRequest) {
    return (
      <>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Success Header */}
          <View style={[styles.successCard, neuOutset(6, 12, Colors.neuSurface)]}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Biometric Verified</Text>
            <Text style={styles.successMessage}>Face matches stored biometric data</Text>
          </View>

          {/* Visitor Details */}
          <View style={[styles.detailsCard, neuOutset(4, 8, Colors.neuSurface)]}>
            <Text style={styles.sectionTitle}>VISITOR INFORMATION</Text>
            
            {approvedRequest.requesterPhotoURL && (
              <Image
                source={{ uri: approvedRequest.requesterPhotoURL }}
                style={styles.visitorPhoto}
              />
            )}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Name:</Text>
              <Text style={styles.detailValue}>{approvedRequest.requesterName}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phone:</Text>
              <Text style={styles.detailValue}>{approvedRequest.requesterPhone}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Email:</Text>
              <Text style={styles.detailValue}>{approvedRequest.requesterEmail}</Text>
            </View>

            {/* Government ID Document */}
            {approvedRequest.identityDocument ? (
              <>
                <Text style={styles.detailLabel}>
                  Identity Document ({approvedRequest.identityDocumentType || 'Government ID'}):
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    console.log('📸 Opening full-screen image viewer');
                    setFullScreenImage(approvedRequest.identityDocument!);
                  }}
                  style={styles.idDocumentTouchable}
                >
                  <Image
                    source={{ uri: approvedRequest.identityDocument }}
                    style={styles.idDocument}
                    resizeMode="contain"
                    pointerEvents="none"
                    onError={(error) => {
                      console.error('Identity document image failed to load:', error);
                    }}
                    onLoad={() => {
                      console.log('✅ Identity document image loaded successfully');
                    }}
                  />
                  <View style={styles.tapToEnlargeHint}>
                    <Text style={styles.tapToEnlargeText}>👆 Tap image to view full size</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.noDocumentBox}>
                <Icon name="warning" size={24} color={Colors.orange600} />
                <Text style={styles.noDocumentText}>No identity document uploaded</Text>
                <Text style={styles.noDocumentSubtext}>Visitor has not uploaded their government ID</Text>
              </View>
            )}
          </View>

          {/* Visit Details */}
          <View style={[styles.detailsCard, neuOutset(4, 8, Colors.neuSurface)]}>
            <Text style={styles.sectionTitle}>VISIT DETAILS</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Destination:</Text>
              <Text style={styles.detailValue}>{approvedRequest.destination}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Purpose:</Text>
              <Text style={styles.detailValue}>{approvedRequest.purpose}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date:</Text>
              <Text style={styles.detailValue}>{approvedRequest.visitDate}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Time:</Text>
              <Text style={styles.detailValue}>{approvedRequest.timeWindow}</Text>
            </View>
          </View>

          {/* Faculty Approval */}
          <View style={[styles.detailsCard, neuOutset(4, 8, Colors.neuSurface)]}>
            <Text style={styles.sectionTitle}>APPROVED BY FACULTY</Text>

            {approvedRequest.targetFacultyPhotoURL && (
              <Image
                source={{ uri: approvedRequest.targetFacultyPhotoURL }}
                style={styles.facultyPhoto}
              />
            )}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Faculty:</Text>
              <Text style={styles.detailValue}>{approvedRequest.targetFacultyName}</Text>
            </View>

            {approvedRequest.facultyRemarks && (
              <View style={[styles.remarksBox, neuInset(2, 4, Colors.neuSurface)]}>
                <Text style={styles.remarksLabel}>Faculty Remarks:</Text>
                <Text style={styles.remarksText}>"{approvedRequest.facultyRemarks}"</Text>
              </View>
            )}
          </View>

          {/* Vehicle Information (if registered) */}
          {hasVehicle && vehiclePlate && (
            <View style={[styles.detailsCard, neuOutset(4, 8, Colors.neuSurface)]}>
              <Text style={styles.sectionTitle}>VEHICLE INFORMATION</Text>
              
              {vehiclePlateImage && (
                <Image
                  source={{ uri: vehiclePlateImage }}
                  style={styles.vehicleImage}
                  resizeMode="contain"
                />
              )}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>License Plate:</Text>
                <Text style={[styles.detailValue, styles.vehiclePlate]}>{vehiclePlate}</Text>
              </View>
              
              <View style={[styles.infoBox, neuInset(2, 4, Colors.neuSurface)]}>
                <Text style={styles.infoText}>✓ Vehicle registered for campus entry</Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <NeuButton
              title="✓ Activate Permit & Generate QR"
              variant="accent"
              size="lg"
              fullWidth
              onPress={handleActivatePermit}
            />

            <NeuButton
              title="✕ Deny Entry"
              variant="danger"
              size="md"
              fullWidth
              onPress={() => {
                Alert.alert(
                  'Deny Entry',
                  'Are you sure you want to deny entry to this visitor?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Deny',
                      style: 'destructive',
                      onPress: () => router.back(),
                    },
                  ]
                );
              }}
            />
          </View>
        </ScrollView>
      </View>

      {/* Full-Screen Image Viewer Modal */}
      <Modal
        visible={!!fullScreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          console.log('🔙 Closing full-screen viewer');
          setFullScreenImage(null);
        }}
        onShow={() => console.log('📺 Full-screen modal shown')}
      >
        <View style={styles.fullScreenModal}>
          <TouchableOpacity
            style={styles.fullScreenBackdrop}
            activeOpacity={1}
            onPress={() => {
              console.log('👆 Backdrop tapped, closing modal');
              setFullScreenImage(null);
            }}
          >
            <View style={styles.fullScreenHeader}>
              <Text style={styles.fullScreenTitle}>Identity Document</Text>
              <TouchableOpacity
                style={styles.fullScreenCloseButton}
                onPress={() => {
                  console.log('❌ Close button tapped');
                  setFullScreenImage(null);
                }}
              >
                <Text style={styles.fullScreenCloseText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.fullScreenImageContainer}>
              {fullScreenImage && (
                <Image
                  source={{ uri: fullScreenImage }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                  onLoad={() => console.log('✅ Full-screen image loaded')}
                  onError={(e) => console.error('❌ Full-screen image error:', e)}
                />
              )}
            </View>

            <Text style={styles.fullScreenHint}>Tap anywhere to close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <Text style={styles.errorText}>Camera permission denied</Text>
          <NeuButton title="← Back" variant="ghost" size="md" onPress={() => router.back()} />
        </View>
      </View>

      {/* Full-Screen Image Viewer Modal */}
      <Modal
        visible={!!fullScreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          console.log('🔙 Closing full-screen viewer');
          setFullScreenImage(null);
        }}
        onShow={() => console.log('📺 Full-screen modal shown')}
      >
        <View style={styles.fullScreenModal}>
          <TouchableOpacity
            style={styles.fullScreenBackdrop}
            activeOpacity={1}
            onPress={() => {
              console.log('👆 Backdrop tapped, closing modal');
              setFullScreenImage(null);
            }}
          >
            <View style={styles.fullScreenHeader}>
              <Text style={styles.fullScreenTitle}>Identity Document</Text>
              <TouchableOpacity
                style={styles.fullScreenCloseButton}
                onPress={() => {
                  console.log('❌ Close button tapped');
                  setFullScreenImage(null);
                }}
              >
                <Text style={styles.fullScreenCloseText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.fullScreenImageContainer}>
              {fullScreenImage && (
                <Image
                  source={{ uri: fullScreenImage }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                  onLoad={() => console.log('✅ Full-screen image loaded')}
                  onError={(e) => console.error('❌ Full-screen image error:', e)}
                />
              )}
            </View>

            <Text style={styles.fullScreenHint}>Tap anywhere to close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: Spacing['3xl'],
    gap: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  card: {
    padding: Spacing.xl,
    borderRadius: Radius['2xl'],
    gap: Spacing.sm,
  },
  title: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 22,
  },
  orText: {
    ...Typography.caption,
    color: Colors.gray400,
    textAlign: 'center',
    marginVertical: -Spacing.sm,
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  cameraHeader: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.xs,
  },
  cameraTitle: {
    ...Typography.headlineSm,
    color: Colors.white,
    fontWeight: '800',
    textAlign: 'center',
  },
  cameraSubtitle: {
    ...Typography.caption,
    color: Colors.white,
    textAlign: 'center',
  },
  cameraControls: {
    gap: Spacing.md,
  },
  capturedPhoto: {
    width: 200,
    height: 200,
    borderRadius: Radius.xl,
    marginBottom: Spacing.lg,
  },
  verifyingText: {
    ...Typography.headlineMd,
    color: Colors.navy900,
    fontWeight: '700',
    textAlign: 'center',
  },
  resultPhoto: {
    width: '100%',
    height: 200,
    borderRadius: Radius.xl,
  },
  failedTitle: {
    ...Typography.headlineMd,
    color: Colors.red600,
    fontWeight: '800',
    textAlign: 'center',
  },
  failedMessage: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 22,
  },
  successCard: {
    padding: Spacing.xl,
    borderRadius: Radius['2xl'],
    gap: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.green50,
  },
  successIcon: {
    fontSize: 64,
    color: Colors.green600,
  },
  successTitle: {
    ...Typography.headlineMd,
    color: Colors.green600,
    fontWeight: '800',
  },
  successMessage: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
  },
  detailsCard: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.tiny,
    color: Colors.gray600,
    fontWeight: '800',
    letterSpacing: 1,
  },
  visitorPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    marginVertical: Spacing.sm,
  },
  facultyPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: 'center',
    marginVertical: Spacing.sm,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    ...Typography.caption,
    color: Colors.gray500,
    fontWeight: '600',
  },
  detailValue: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '700',
  },
  idDocument: {
    width: '100%',
    height: 200,
    borderRadius: Radius.lg,
    marginTop: Spacing.sm,
    backgroundColor: Colors.gray100,
  },
  idDocumentTouchable: {
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  noDocumentBox: {
    padding: Spacing.lg,
    backgroundColor: Colors.yellow50,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  noDocumentText: {
    ...Typography.bodyMd,
    color: Colors.yellow900,
    fontWeight: '700',
    textAlign: 'center',
  },
  noDocumentSubtext: {
    ...Typography.caption,
    color: Colors.yellow700,
    textAlign: 'center',
    marginTop: 4,
  },
  remarksBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: 4,
    marginTop: Spacing.xs,
  },
  remarksLabel: {
    ...Typography.tiny,
    color: Colors.gray600,
    fontWeight: '700',
  },
  remarksText: {
    ...Typography.caption,
    color: Colors.gray700,
    fontStyle: 'italic',
  },
  actionButtons: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  vehiclePrompt: {
    gap: Spacing.lg,
  },
  detectedPlateText: {
    fontWeight: '800',
    color: Colors.accent,
  },
  plateGuide: {
    position: 'absolute',
    top: '35%',
    left: '10%',
    width: '80%',
    height: '20%',
    alignSelf: 'center',
  },
  vehicleImage: {
    width: '100%',
    height: 150,
    borderRadius: Radius.lg,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.gray100,
  },
  vehiclePlate: {
    fontFamily: 'monospace',
    fontSize: 20,
    letterSpacing: 2,
  },
  infoBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
  },
  infoText: {
    ...Typography.caption,
    color: Colors.green600,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    ...Typography.bodyMd,
    color: Colors.red600,
    textAlign: 'center',
  },
  tapToEnlargeHint: {
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    backgroundColor: Colors.blue50,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  tapToEnlargeText: {
    ...Typography.tiny,
    color: Colors.blue600,
    fontWeight: '600',
  },
  verifiedHeader: {
    padding: Spacing.xl,
    borderRadius: Radius['2xl'],
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.green50,
  },
  verifiedIconContainer: {
    marginBottom: Spacing.sm,
  },
  verifiedIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.green500,
    alignItems: 'center',
    justifyContent: 'center',
    ...neuOutset(4, 8, Colors.green500),
  },
  verifiedIconCheck: {
    fontSize: 48,
    color: Colors.white,
    fontWeight: '800',
  },
  verifiedTitle: {
    ...Typography.headlineLgMobile,
    color: Colors.green700,
    fontWeight: '800',
    textAlign: 'center',
  },
  verifiedSubtitle: {
    ...Typography.bodyMd,
    color: Colors.green600,
    textAlign: 'center',
    lineHeight: 22,
  },
  verificationBadge: {
    width: '100%',
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.white,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  badgeContent: {
    flex: 1,
    gap: 4,
  },
  badgeLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeValue: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '700',
  },
  badgeDivider: {
    height: 1,
    backgroundColor: Colors.gray200,
    marginVertical: Spacing.sm,
  },
  vehicleQuestionCard: {
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  vehicleIconHeader: {
    marginBottom: Spacing.sm,
  },
  vehicleQuestion: {
    ...Typography.headlineMd,
    color: Colors.navy900,
    fontWeight: '800',
    textAlign: 'center',
  },
  vehicleSubtext: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 22,
  },
  vehicleActions: {
    gap: Spacing.lg,
  },
  fullScreenModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  fullScreenBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.lg,
  },
  fullScreenTitle: {
    ...Typography.headlineMd,
    color: Colors.white,
    fontWeight: '700',
  },
  fullScreenCloseButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: Radius.lg,
  },
  fullScreenCloseText: {
    ...Typography.bodyMd,
    color: Colors.white,
    fontWeight: '600',
  },
  fullScreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  fullScreenHint: {
    ...Typography.caption,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    padding: Spacing.xl,
  },
});
