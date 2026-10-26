import { Platform } from 'react-native';
import * as Device from 'expo-device';

const ANDROID_EMULATOR_HOST = 'http://10.0.2.2';

function getDefaultBaseUrl(port: number, path: string) {
  return `${ANDROID_EMULATOR_HOST}:${port}${path}`;
}

function resolveBaseUrl(envValue: string | undefined, defaultValue: string) {
  if (envValue && envValue.trim().length > 0) {
    return envValue.trim();
  }

  if (Platform.OS === 'android' && !Device.isDevice) {
    return defaultValue;
  }

  return defaultValue;
}

export const API_BASE_URL = resolveBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  getDefaultBaseUrl(3000, '/api')
);

export const BIOMETRIC_API_BASE_URL = resolveBaseUrl(
  process.env.EXPO_PUBLIC_BIOMETRIC_API_BASE_URL,
  getDefaultBaseUrl(8001, '/api/v1')
);

/**
 * The ANPR (number plate recognition) service.
 *
 * A third service on its own port rather than a route on one of the other two: it needs
 * onnxruntime-gpu, whose CUDA and cuDNN pins conflict with the TensorFlow build the
 * biometric service uses, so the two cannot share a Python environment.
 */
export const ANPR_API_BASE_URL = resolveBaseUrl(
  process.env.EXPO_PUBLIC_ANPR_API_BASE_URL,
  getDefaultBaseUrl(8002, '/api/v1')
);

export function getBackendOrigin(baseUrl: string) {
  return baseUrl.replace(/\/api(?:\/v1)?\/?$/, '');
}
