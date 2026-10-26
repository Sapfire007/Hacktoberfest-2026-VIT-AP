/**
 * Identity Details Screen — Structured Personal Information & ID Proof
 * 
 * Captures:
 * 1. First Name (Mandatory *)
 * 2. Middle Name (Optional)
 * 3. Last Name (Mandatory *)
 * 4. Phone Number (Mandatory *)
 * 5. Identity Proof Dropdown (Mandatory *):
 *    - Aadhar Card
 *    - PAN Card
 *    - Voter ID Card
 *    - Indian Passport
 *    - Birth Certificate
 * 6. Document Attachment:
 *    - In-App Document Camera Scanner (uses expo-camera — 100% crash-safe on Android)
 *    - Photo Library / Gallery picker (safe, allowsEditing disabled)
 *    - File Picker for PDF / Image (copyToCacheDirectory enabled)
 * 
 * Features Android low-memory recovery (ImagePicker.getPendingResultAsync)
 * and AsyncStorage draft persistence so state is never lost during camera interaction.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuInput } from '@/components/ui/NeuInput';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuDropdown } from '@/components/ui/NeuDropdown';
import { useAuth } from '@/context/AuthContext';
import * as ImageManipulator from 'expo-image-manipulator';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);
const CARD_HEIGHT = Math.round(CARD_WIDTH / 1.58); // Standard ISO ID-1 aspect ratio
const FORM_DRAFT_STORAGE_KEY = '@vision_identity_draft';

/**
 * Maximum file size for upload (in bytes).
 * Base64 inflates by ~33 %, so 700 KB raw → ~933 KB base64, safely under Firestore's
 * 1 048 487-byte string-field limit. Images captured by camera or picked from gallery
 * are auto-compressed to fit; PDFs are rejected with a user-friendly message.
 */
const MAX_UPLOAD_BYTES = 700 * 1024; // 700 KB

const ID_PROOF_OPTIONS = [
  'Aadhar Card',
  'PAN Card',
  'Voter ID Card',
  'Indian Passport',
  'Birth Certificate',
];

interface AttachedDoc {
  name: string;
  uri: string;
  mimeType: string;
  size?: number;
  isImage: boolean;
}

export default function IdentityDetailsScreen() {
  const router = useRouter();
  const { user, saveIdentityDetails, getIdToken } = useAuth();

  // Form State
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedIdProof, setSelectedIdProof] = useState<string | null>(null);
  const [attachedDoc, setAttachedDoc] = useState<AttachedDoc | null>(null);

  // Errors & Submitting
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // In-App Camera Modal State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'back' | 'front'>('back');
  const [torchOn, setTorchOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // 1. Pre-populate from Google account or saved draft on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Try restoring draft from local storage first (in case activity was restarted)
        const savedDraftStr = await AsyncStorage.getItem(FORM_DRAFT_STORAGE_KEY);
        if (savedDraftStr) {
          const draft = JSON.parse(savedDraftStr);
          if (draft.firstName) setFirstName(draft.firstName);
          if (draft.middleName) setMiddleName(draft.middleName);
          if (draft.lastName) setLastName(draft.lastName);
          if (draft.phone) setPhone(draft.phone);
          if (draft.selectedIdProof) setSelectedIdProof(draft.selectedIdProof);
          if (draft.attachedDoc) setAttachedDoc(draft.attachedDoc);
          return;
        }
      } catch (err) {
        console.warn('Could not restore draft:', err);
      }

      // Fallback: populate from user object
      if (user?.name) {
        const parts = user.name.trim().split(' ');
        if (parts.length === 1) {
          setFirstName(parts[0]);
        } else if (parts.length === 2) {
          setFirstName(parts[0]);
          setLastName(parts[1]);
        } else if (parts.length >= 3) {
          setFirstName(parts[0]);
          setMiddleName(parts.slice(1, -1).join(' '));
          setLastName(parts[parts.length - 1]);
        }
      }
      if (user?.phone) {
        setPhone(user.phone);
      }
    };

    void loadInitialData();
  }, [user]);

  // 2. Check for any pending image results (Android Activity lifecycle recovery)
  useEffect(() => {
    const checkPendingImage = async () => {
      try {
        const pending = await ImagePicker.getPendingResultAsync();
        if (
          pending &&
          !('canceled' in pending && pending.canceled) &&
          'assets' in pending &&
          pending.assets &&
          pending.assets.length > 0
        ) {
          const asset = pending.assets[0];
          const fileName = `${
            selectedIdProof ? selectedIdProof.replace(/\s+/g, '_').toLowerCase() : 'id_proof'
          }_restored.jpg`;

          setAttachedDoc({
            name: fileName,
            uri: asset.uri,
            mimeType: 'image/jpeg',
            size: asset.fileSize,
            isImage: true,
          });
          setErrors((prev) => ({ ...prev, doc: '' }));
        }
      } catch (err) {
        console.log('Pending image check info:', err);
      }
    };

    void checkPendingImage();
  }, [selectedIdProof]);

  // 3. Persist form draft on updates so user never loses their data
  useEffect(() => {
    const draft = {
      firstName,
      middleName,
      lastName,
      phone,
      selectedIdProof,
      attachedDoc,
    };
    void AsyncStorage.setItem(FORM_DRAFT_STORAGE_KEY, JSON.stringify(draft)).catch(() => {});
  }, [firstName, middleName, lastName, phone, selectedIdProof, attachedDoc]);

  /**
   * Compress an image to fit under MAX_UPLOAD_BYTES.
   *
   * Strategy: start at quality 0.7, max width 1600.  If the result is still too large,
   * iteratively halve the quality and shrink the width until it fits.  The loop runs at
   * most 5 times (quality 0.7 → 0.5 → 0.35 → 0.25 → 0.18), which covers even 12 MP
   * phone cameras.
   *
   * Returns { uri, size } of the compressed file — always a JPEG.
   */
  const compressImageToFit = async (
    sourceUri: string
  ): Promise<{ uri: string; size: number }> => {
    let quality = 0.7;
    let maxWidth = 1600;
    const MIN_QUALITY = 0.15;
    const MAX_ITERATIONS = 5;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const result = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: maxWidth } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
      );

      const info = await FileSystem.getInfoAsync(result.uri);
      const fileSize = (info.exists && 'size' in info) ? info.size : 0;

      if (fileSize > 0 && fileSize <= MAX_UPLOAD_BYTES) {
        return { uri: result.uri, size: fileSize };
      }

      // Reduce quality and resolution for the next pass
      quality = Math.max(MIN_QUALITY, quality * 0.7);
      maxWidth = Math.max(600, Math.round(maxWidth * 0.75));
    }

    // Final attempt at minimum settings
    const finalResult = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: 600 } }],
      { compress: MIN_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    const finalInfo = await FileSystem.getInfoAsync(finalResult.uri);
    const finalSize = (finalInfo.exists && 'size' in finalInfo) ? finalInfo.size : 0;
    return { uri: finalResult.uri, size: finalSize };
  };

  /**
   * Launch In-App ID Card Camera
   * Keeps user inside the app and avoids external activity crashes
   */
  const handleOpenInAppCamera = async () => {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is required to take a clear photo of your government ID card.',
          [{ text: 'OK' }]
        );
        return;
      }
    }
    setTorchOn(false);
    setIsCameraModalOpen(true);
  };

  /**
   * Capture photo inside in-app camera
   */
  const handleTakeInAppPhoto = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error('Camera returned an empty image');
      }

      // Auto-compress to fit under MAX_UPLOAD_BYTES — it's the app's job, not the user's
      const compressed = await compressImageToFit(photo.uri);

      const docName = `${
        selectedIdProof ? selectedIdProof.replace(/\s+/g, '_').toLowerCase() : 'id_proof'
      }_camera.jpg`;

      setAttachedDoc({
        name: docName,
        uri: compressed.uri,
        mimeType: 'image/jpeg',
        size: compressed.size,
        isImage: true,
      });

      setErrors((prev) => ({ ...prev, doc: '' }));
      setIsCameraModalOpen(false);
    } catch (err: any) {
      console.error('In-app camera capture failed:', err);
      Alert.alert(
        'Could Not Capture Photo',
        'Something went wrong while taking the photo. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * Pick Image from Device Gallery (Safe — allowsEditing: false to avoid Android CROP crash)
   */
  const handlePickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Gallery Permission Required',
          'We need access to your photo library to let you pick an image of your ID card.',
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // CRITICAL: Setting true crashes on Android without crop activity
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        // Auto-compress gallery images to fit
        const compressed = await compressImageToFit(asset.uri);

        const docName =
          asset.fileName ||
          `${selectedIdProof ? selectedIdProof.replace(/\s+/g, '_').toLowerCase() : 'id_proof'}_gallery.jpg`;

        setAttachedDoc({
          name: docName,
          uri: compressed.uri,
          mimeType: 'image/jpeg',
          size: compressed.size,
          isImage: true,
        });

        setErrors((prev) => ({ ...prev, doc: '' }));
        if (isCameraModalOpen) setIsCameraModalOpen(false);
      }
    } catch (err: any) {
      console.error('Gallery pick error:', err);
      Alert.alert(
        'Could Not Load Photo',
        'We were unable to load the selected photo. Please try picking a different image.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * File Picker for PDF or Image
   */
  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const isImg = Boolean(
          asset.mimeType?.startsWith('image/') ||
            asset.name.toLowerCase().endsWith('.jpg') ||
            asset.name.toLowerCase().endsWith('.jpeg') ||
            asset.name.toLowerCase().endsWith('.png')
        );

        if (isImg) {
          // Images — auto-compress just like camera/gallery
          const compressed = await compressImageToFit(asset.uri);
          setAttachedDoc({
            name: asset.name,
            uri: compressed.uri,
            mimeType: 'image/jpeg',
            size: compressed.size,
            isImage: true,
          });
        } else {
          // PDFs — cannot compress, enforce size limit with friendly message
          const fileSize = asset.size || 0;
          if (fileSize > MAX_UPLOAD_BYTES) {
            const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
            Alert.alert(
              'PDF Is Too Large',
              `The selected PDF is ${sizeMB} MB, but the maximum allowed size is 700 KB.\n\nPlease upload a smaller PDF, or take a photo of your ID card using the camera instead.`,
              [{ text: 'Got It' }]
            );
            return;
          }
          setAttachedDoc({
            name: asset.name,
            uri: asset.uri,
            mimeType: asset.mimeType || 'application/pdf',
            size: asset.size,
            isImage: false,
          });
        }

        setErrors((prev) => ({ ...prev, doc: '' }));
      }
    } catch (err: any) {
      console.error('File pick error:', err);
      Alert.alert(
        'Could Not Open File',
        'We were unable to open the selected file. Please try a different document.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Validate Form
   */
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required *';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required *';
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const digits =
      cleanPhone.length === 12 && cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone;
    if (!digits) {
      newErrors.phone = 'Phone number is required *';
    } else if (digits.length !== 10) {
      newErrors.phone = 'Phone number must be a valid 10-digit mobile number *';
    }

    if (!selectedIdProof) {
      newErrors.idProof = 'Please select an identity proof type *';
    }

    if (!attachedDoc) {
      newErrors.doc = 'Please upload a PDF/picture or snap a photo of your ID *';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Submit Details to Firebase & Continue
   * 
   * Process:
   * 1. Upload document file to Firebase Storage (or Firestore fallback)
   * 2. Get back storageUri (cloud reference) and fileSize
   * 3. Save identity details + storageUri to Firestore
   */
  const handleContinue = async () => {
    if (!validateForm()) {
      Alert.alert(
        'Missing Information',
        'Please fill in all the fields marked with an asterisk (*) before continuing.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const digits =
        cleanPhone.length === 12 && cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone;

      // Images are already compressed at pick/capture time.
      // For non-image files (PDFs), do a final size guard:
      if (attachedDoc && !attachedDoc.isImage) {
        let pdfSize = attachedDoc.size || 0;
        if (!pdfSize) {
          try {
            const info = await FileSystem.getInfoAsync(attachedDoc.uri);
            if (info.exists && 'size' in info) pdfSize = info.size;
          } catch (_) {}
        }
        if (pdfSize > MAX_UPLOAD_BYTES) {
          const sizeMB = (pdfSize / (1024 * 1024)).toFixed(1);
          Alert.alert(
            'PDF Is Too Large',
            `Your PDF is ${sizeMB} MB, but the maximum allowed size is 700 KB.\n\nPlease upload a smaller file, or use the camera to snap a photo of your ID instead.`,
            [{ text: 'Got It' }]
          );
          setIsSubmitting(false);
          return;
        }
      }

      // Step 1: Upload document to cloud storage
      console.log('📤 Uploading identity document…');

      let storageUri: string | null = null;
      let cloudFileSize = attachedDoc!.size || 0;

      try {
        const token = await getIdToken();
        const fileBase64 = await uriToBase64(attachedDoc!.uri);
        const { authAPI } = await import('@/services/api.service');

        const uploadResult = await authAPI.uploadIdDocument(token, {
          fileData: fileBase64,
          fileName: attachedDoc!.name,
          mimeType: attachedDoc!.mimeType,
          idType: selectedIdProof!,
        });

        if (uploadResult.success && uploadResult.data) {
          storageUri = uploadResult.data.storageUri;
          cloudFileSize = uploadResult.data.fileSize || cloudFileSize;
          console.log('✅ Document uploaded:', storageUri);
        } else {
          throw new Error(uploadResult.error || 'Upload failed');
        }
      } catch (uploadErr: any) {
        console.error('Document upload error:', uploadErr);
        Alert.alert(
          'Upload Unsuccessful',
          'We could not upload your document right now. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Step 2: Save identity details with cloud reference AND base64 data URI
      console.log('💾 Saving identity details…');

      // Convert to base64 data URI for immediate display (no network request needed)
      const fileBase64 = await uriToBase64(attachedDoc!.uri);

      const identityPayload = {
        firstName: firstName.trim(),
        middleName: middleName.trim() || null,
        lastName: lastName.trim(),
        phone: `+91${digits}`,
        identityProof: {
          idType: selectedIdProof!,
          documentName: attachedDoc!.name,
          mimeType: attachedDoc!.mimeType,
          fileSize: cloudFileSize,
          storageUri: storageUri, // Cloud storage reference
          documentUri: fileBase64, // Base64 data URI for fast display
        },
      };

      await saveIdentityDetails(identityPayload);
      console.log('✅ Identity details saved with base64 data URI');

      // Done — clear draft and move to Face Biometric, by way of its consent screen
      await AsyncStorage.removeItem(FORM_DRAFT_STORAGE_KEY).catch(() => {});
      router.replace('/(onboarding)/consent');
    } catch (err: any) {
      console.error('Identity submission error:', err);
      Alert.alert(
        'Something Went Wrong',
        'We could not save your details. Please try again in a moment.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Convert file URI to base64 string
   */
  const uriToBase64 = async (uri: string): Promise<string> => {
    try {
      // Use expo-file-system to read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:${attachedDoc!.mimeType};base64,${base64}`;
    } catch (err) {
      console.error('Failed to convert file to base64:', err);
      throw new Error('Could not read document file');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.stepBadge, neuInset(2, 4)]}>
          <Text style={styles.stepBadgeText}>Step 2 of 4 • Identity Verification</Text>
        </View>
        <Text style={styles.title}>Personal Identity Details</Text>
        <Text style={styles.subtitle}>
          Enter your legal personal details and provide a government-recognized identity proof.
        </Text>
      </View>

      {/* Form Container Card */}
      <View style={[styles.formCard, neuOutset(8, 16, Colors.neuSurface)]}>
        {/* Section 1: Personal Details */}
        <Text style={styles.sectionHeader}>1. Personal Information</Text>

        {/* First Name (Mandatory) */}
        <NeuInput
          label="FIRST NAME *"
          placeholder="e.g. Aarav"
          value={firstName}
          onChangeText={(text) => {
            setFirstName(text);
            if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: '' }));
          }}
          error={errors.firstName}
          autoCapitalize="words"
        />

        {/* Middle Name (Optional) */}
        <NeuInput
          label="MIDDLE NAME (OPTIONAL)"
          placeholder="e.g. Kumar"
          value={middleName}
          onChangeText={setMiddleName}
          autoCapitalize="words"
        />

        {/* Last Name (Mandatory) */}
        <NeuInput
          label="LAST NAME *"
          placeholder="e.g. Sharma"
          value={lastName}
          onChangeText={(text) => {
            setLastName(text);
            if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: '' }));
          }}
          error={errors.lastName}
          autoCapitalize="words"
        />

        {/* Phone Number (Mandatory) */}
        <NeuInput
          label="PHONE NUMBER *"
          placeholder="9876543210"
          value={phone}
          onChangeText={(text) => {
            setPhone(text);
            if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
          }}
          error={errors.phone}
          keyboardType="phone-pad"
          maxLength={13}
        />

        <View style={styles.divider} />

        {/* Section 2: Personal Identity Proof */}
        <Text style={styles.sectionHeader}>2. Government Identity Proof</Text>

        {/* Identity Proof Dropdown */}
        <NeuDropdown
          label="SELECT IDENTITY PROOF *"
          options={ID_PROOF_OPTIONS}
          selectedValue={selectedIdProof}
          onSelect={(val) => {
            setSelectedIdProof(val);
            if (errors.idProof) setErrors((prev) => ({ ...prev, idProof: '' }));
          }}
          placeholder="Choose Aadhar, PAN, Voter ID, Passport..."
          error={errors.idProof}
        />

        {/* Document Upload / Camera Actions */}
        <Text style={styles.uploadLabel}>ATTACH ID PROOF DOCUMENT *</Text>
        <Text style={styles.uploadSubLabel}>
          Scan your card directly with the in-app camera, or choose a file from your device.
        </Text>

        <View style={styles.actionButtonsRow}>
          {/* In-App Camera Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenInAppCamera}
            style={[styles.attachButton, styles.attachButtonPrimary, neuOutset(4, 8, Colors.neuSurface)]}
          >
            <Text style={styles.attachButtonIcon}>📷</Text>
            <Text style={[styles.attachButtonText, styles.attachButtonPrimaryText]}>
              Snap via Camera
            </Text>
          </TouchableOpacity>

          {/* Photo Gallery Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePickFromGallery}
            style={[styles.attachButton, neuOutset(4, 8, Colors.neuSurface)]}
          >
            <Text style={styles.attachButtonIcon}>🖼️</Text>
            <Text style={styles.attachButtonText}>Photos Gallery</Text>
          </TouchableOpacity>

          {/* PDF / File Manager Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePickDocument}
            style={[styles.attachButton, neuOutset(4, 8, Colors.neuSurface)]}
          >
            <Text style={styles.attachButtonIcon}>📄</Text>
            <Text style={styles.attachButtonText}>Upload PDF</Text>
          </TouchableOpacity>
        </View>

        {errors.doc ? <Text style={styles.docError}>{errors.doc}</Text> : null}

        {/* Document Preview Card */}
        {attachedDoc && (
          <View style={[styles.docPreviewCard, neuInset(3, 6)]}>
            <View style={styles.docHeaderRow}>
              {attachedDoc.isImage ? (
                <Image source={{ uri: attachedDoc.uri }} style={styles.thumbnail} />
              ) : (
                <View style={styles.pdfBadge}>
                  <Text style={styles.pdfBadgeIcon}>📄</Text>
                  <Text style={styles.pdfBadgeText}>PDF</Text>
                </View>
              )}

              <View style={styles.docInfo}>
                <Text style={styles.docName} numberOfLines={1}>
                  {attachedDoc.name}
                </Text>
                <Text style={styles.docMeta}>
                  {attachedDoc.isImage ? 'Photo ID Proof' : 'PDF Document'}
                  {attachedDoc.size ? ` • ${formatFileSize(attachedDoc.size)}` : ''}
                </Text>

                {/* Status Badge */}
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusBadgeText}>Attached & Ready</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setAttachedDoc(null)}
                style={styles.removeDocBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Remove document"
              >
                <Text style={styles.removeDocText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Replace / Retake Action Options */}
            <View style={styles.previewActionsRow}>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={handleOpenInAppCamera}
                activeOpacity={0.7}
              >
                <Text style={styles.previewActionBtnText}>📷 Retake Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={handlePickFromGallery}
                activeOpacity={0.7}
              >
                <Text style={styles.previewActionBtnText}>🖼️ Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={handlePickDocument}
                activeOpacity={0.7}
              >
                <Text style={styles.previewActionBtnText}>📄 PDF / File</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Proceed to Face Biometric Button */}
        <NeuButton
          title={isSubmitting ? 'Uploading to Cloud...' : 'Continue to Face Biometric →'}
          variant="primary"
          size="lg"
          onPress={handleContinue}
          disabled={isSubmitting}
          style={styles.continueButton}
        />
      </View>

      {/* Submitting Loading Overlay */}
      {isSubmitting && (
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingBox, neuOutset(6, 12, Colors.neuSurface)]}>
            <ActivityIndicator size="large" color={Colors.blue500} />
            <Text style={styles.loadingText}>Uploading Document to Cloud Storage...</Text>
            <Text style={styles.loadingSubtext}>Please wait, do not close the app</Text>
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* IN-APP ID CARD SCANNER CAMERA MODAL (Zero crash, avoids external activity) */}
      {/* ========================================================================= */}
      <Modal
        visible={isCameraModalOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setIsCameraModalOpen(false)}
      >
        <View style={styles.cameraModalContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />

          {/* Live Camera View */}
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={cameraFacing}
            enableTorch={torchOn}
          />

          {/* Viewfinder Framing Overlay */}
          <View style={styles.cameraOverlay}>
            {/* Top Dimmed Region */}
            <View style={styles.overlayTop}>
              <View style={styles.cameraTopBar}>
                <TouchableOpacity
                  style={styles.iconCircleBtn}
                  onPress={() => setIsCameraModalOpen(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.iconCircleText}>✕</Text>
                </TouchableOpacity>

                <View style={styles.cameraHeaderInfo}>
                  <Text style={styles.cameraTitle}>ID Document Scanner</Text>
                  <Text style={styles.cameraSubtitle}>
                    {selectedIdProof || 'Government ID Card'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.iconCircleBtn, torchOn ? styles.iconCircleActive : null]}
                  onPress={() => setTorchOn((prev) => !prev)}
                >
                  <Text style={styles.iconCircleText}>{torchOn ? '⚡' : '💡'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.alignInstructionText}>
                Fit all 4 corners of your ID inside the rectangle
              </Text>
            </View>

            {/* Middle Region with Card Cutout */}
            <View style={styles.overlayMiddleRow}>
              <View style={styles.overlaySide} />
              
              {/* Card Framing Guide Box */}
              <View style={[styles.cardTargetBox, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>
                {/* 4 Corner Markers */}
                <View style={[styles.cornerBracket, styles.cornerTL]} />
                <View style={[styles.cornerBracket, styles.cornerTR]} />
                <View style={[styles.cornerBracket, styles.cornerBL]} />
                <View style={[styles.cornerBracket, styles.cornerBR]} />

                {/* Center subtle icon guide */}
                <View style={styles.centerGuideBadge}>
                  <Text style={styles.centerGuideText}>
                    {selectedIdProof ? `Hold ${selectedIdProof} Steady` : 'Hold ID Steady'}
                  </Text>
                </View>
              </View>

              <View style={styles.overlaySide} />
            </View>

            {/* Bottom Dimmed Region with Capture Controls */}
            <View style={styles.overlayBottom}>
              <View style={styles.bottomControlsRow}>
                {/* Switch Camera */}
                <TouchableOpacity
                  style={styles.bottomAuxBtn}
                  onPress={() => setCameraFacing((f) => (f === 'back' ? 'front' : 'back'))}
                >
                  <Text style={styles.bottomAuxIcon}>🔄</Text>
                  <Text style={styles.bottomAuxText}>Flip</Text>
                </TouchableOpacity>

                {/* Shutter Button */}
                <TouchableOpacity
                  style={[styles.shutterOuterRing, isCapturing ? styles.shutterDisabled : null]}
                  onPress={handleTakeInAppPhoto}
                  disabled={isCapturing}
                  activeOpacity={0.7}
                >
                  {isCapturing ? (
                    <ActivityIndicator size="small" color="#0F2D52" />
                  ) : (
                    <View style={styles.shutterInnerCircle} />
                  )}
                </TouchableOpacity>

                {/* Gallery Quick Button */}
                <TouchableOpacity
                  style={styles.bottomAuxBtn}
                  onPress={handlePickFromGallery}
                >
                  <Text style={styles.bottomAuxIcon}>🖼️</Text>
                  <Text style={styles.bottomAuxText}>Gallery</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.cameraNote}>
                Photo stays encrypted & securely stored for gate verification
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  stepBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.neuSurface,
    marginBottom: Spacing.sm,
  },
  stepBadgeText: {
    ...Typography.caption,
    color: Colors.blue500,
    fontWeight: '700',
  },
  title: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.bodySm,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.sm,
  },
  formCard: {
    backgroundColor: Colors.neuSurface,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  sectionHeader: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontSize: 16,
    fontWeight: '700',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.gray200,
    marginVertical: Spacing.sm,
  },
  uploadLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    marginLeft: 4,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  uploadSubLabel: {
    ...Typography.caption,
    color: Colors.gray500,
    marginLeft: 4,
    marginBottom: Spacing.xs,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  attachButton: {
    flex: 1,
    backgroundColor: Colors.neuSurface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    gap: 4,
  },
  attachButtonPrimary: {
    borderColor: Colors.blue500,
    backgroundColor: '#F0F7FF',
  },
  attachButtonIcon: {
    fontSize: 20,
  },
  attachButtonText: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.navy900,
    textAlign: 'center',
    fontSize: 11,
  },
  attachButtonPrimaryText: {
    color: Colors.blue500,
    fontWeight: '700',
  },
  docError: {
    ...Typography.caption,
    color: Colors.red600,
    marginLeft: 4,
  },
  docPreviewCard: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.neuSurface,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  docHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray200,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  pdfBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.red600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfBadgeIcon: {
    fontSize: 16,
  },
  pdfBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '700',
    fontSize: 14,
  },
  docMeta: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 2,
    fontSize: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    marginTop: 4,
    gap: 5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.green600,
  },
  statusBadgeText: {
    ...Typography.caption,
    color: Colors.green600,
    fontWeight: '700',
    fontSize: 11,
  },
  removeDocBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeDocText: {
    color: Colors.gray700,
    fontSize: 13,
    fontWeight: 'bold',
  },
  previewActionsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  previewActionBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8E2EC',
  },
  previewActionBtnText: {
    ...Typography.caption,
    color: Colors.blue500,
    fontWeight: '600',
    fontSize: 11,
  },
  continueButton: {
    marginTop: Spacing.lg,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  loadingBox: {
    backgroundColor: Colors.neuSurface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    minWidth: 240,
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingSubtext: {
    ...Typography.caption,
    color: Colors.gray600,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },

  /* ========================================================= */
  /* In-App Camera Modal Styles                                */
  /* ========================================================= */
  cameraModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  overlayTop: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 16 : 56,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    alignItems: 'center',
  },
  cameraTopBar: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  iconCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleActive: {
    backgroundColor: '#F59E0B',
  },
  iconCircleText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cameraHeaderInfo: {
    alignItems: 'center',
  },
  cameraTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cameraSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  alignInstructionText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  overlayMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlaySide: {
    flex: 1,
    height: CARD_HEIGHT,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  cardTargetBox: {
    position: 'relative',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1.5,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cornerBracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#38BDF8',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  centerGuideBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  centerGuideText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  overlayBottom: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingBottom: Platform.OS === 'android' ? 32 : 48,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  bottomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing.md,
  },
  bottomAuxBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    gap: 4,
  },
  bottomAuxIcon: {
    fontSize: 24,
  },
  bottomAuxText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  shutterOuterRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  shutterDisabled: {
    opacity: 0.6,
  },
  shutterInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
  },
  cameraNote: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
