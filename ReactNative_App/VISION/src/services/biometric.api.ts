/**
 * Biometric API Service
 *
 * Handles facial biometric enrollment and verification with the Biometric Backend.
 */

import { BIOMETRIC_API_BASE_URL } from '@/config/backend';
import { firebaseAuth } from '@/services/firebase.auth';

/**
 * Every call carries the signed-in user's token: the service lets a user manage only their
 * own face, and only security and admin search or check other people's.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await firebaseAuth.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface BiometricEnrollmentResponse {
  success: boolean;
  user_id: string;
  message: string;
  faces_processed: number;
  embedding_dimensions: number;
}

export interface BiometricVerificationResponse {
  success: boolean;
  user_id: string;
  is_match: boolean;
  confidence_score: number;
  distance: number;
  message: string;
}

export interface BiometricStatusResponse {
  user_id: string;
  is_enrolled: boolean;
  enrolled_at?: string;
}

export interface BiometricError {
  success: false;
  error: {
    error_code: string;
    message: string;
    guidance?: string;
  };
}

/**
 * Enroll a user's biometric data
 */
export async function enrollBiometric(
  userId: string,
  images: Blob[],
  consentGiven: boolean = true
): Promise<BiometricEnrollmentResponse | BiometricError> {
  try {
    const formData = new FormData();
    formData.append('user_id', userId);
    formData.append('consent_given', consentGiven.toString());

    // Append all face images
    images.forEach((image, index) => {
      formData.append('images', image, `face_${index}.jpg`);
    });

    const response = await fetch(`${BIOMETRIC_API_BASE_URL}/biometric/enroll`, {
      method: 'POST',
      headers: await authHeaders(),
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return data as BiometricError;
    }

    return data as BiometricEnrollmentResponse;
  } catch (error: any) {
    console.error('❌ Biometric enrollment error:', error);
    return {
      success: false,
      error: {
        error_code: 'NETWORK_ERROR',
        message: error.message || 'Failed to connect to biometric service',
      },
    };
  }
}

/**
 * Verify a user's face against stored biometric
 */
export async function verifyBiometric(
  userId: string,
  image: Blob
): Promise<BiometricVerificationResponse | BiometricError> {
  try {
    const formData = new FormData();
    formData.append('user_id', userId);
    formData.append('image', image, 'face_verify.jpg');

    const response = await fetch(`${BIOMETRIC_API_BASE_URL}/biometric/verify`, {
      method: 'POST',
      headers: await authHeaders(),
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return data as BiometricError;
    }

    return data as BiometricVerificationResponse;
  } catch (error: any) {
    console.error('❌ Biometric verification error:', error);
    return {
      success: false,
      error: {
        error_code: 'NETWORK_ERROR',
        message: error.message || 'Failed to connect to biometric service',
      },
    };
  }
}

/**
 * Check if a user is enrolled
 */
export async function checkBiometricStatus(
  userId: string
): Promise<BiometricStatusResponse | BiometricError> {
  try {
    const response = await fetch(
      `${BIOMETRIC_API_BASE_URL}/biometric/${encodeURIComponent(userId)}/status`,
      {
        method: 'GET',
        headers: await authHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return data as BiometricError;
    }

    return data as BiometricStatusResponse;
  } catch (error: any) {
    console.error('❌ Biometric status check error:', error);
    return {
      success: false,
      error: {
        error_code: 'NETWORK_ERROR',
        message: error.message || 'Failed to connect to biometric service',
      },
    };
  }
}

/**
 * Delete a user's biometric data
 */
export async function deleteBiometric(
  userId: string
): Promise<{ success: boolean; message: string } | BiometricError> {
  try {
    const response = await fetch(
      `${BIOMETRIC_API_BASE_URL}/biometric/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: await authHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return data as BiometricError;
    }

    return data;
  } catch (error: any) {
    console.error('❌ Biometric deletion error:', error);
    return {
      success: false,
      error: {
        error_code: 'NETWORK_ERROR',
        message: error.message || 'Failed to connect to biometric service',
      },
    };
  }
}
