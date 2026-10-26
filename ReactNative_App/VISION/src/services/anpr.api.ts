/**
 * ANPR API — number plate recognition.
 *
 * Talks to the Python ANPR service (port 8002), not to Node_Backend. It is the only part
 * of the app that does so, and the call is deliberately unauthenticated: the service holds
 * no data, issues no tokens and returns a string. Putting a Firebase token on it would
 * imply it decided something, which it does not — the officer decides, by accepting or
 * correcting what comes back.
 */

import { ANPR_API_BASE_URL } from '@/config/backend';

export interface PlateCandidate {
  plate: string;
  display: string;
  raw: string;
  confidence: number;
  detection_confidence: number;
  char_confidences?: number[] | null;
  format_valid: boolean;
  format_name?: string | null;
  /** Post-processing changed the string. Worth showing — the officer is accepting a guess. */
  corrected: boolean;
  /** Below the service's confidence threshold. The field should open for editing. */
  low_confidence: boolean;
  box: { x1: number; y1: number; x2: number; y2: number };
}

export interface ReadResult {
  success: boolean;
  best?: PlateCandidate | null;
  plates: PlateCandidate[];
  processing_ms: number;
  provider?: string | null;
  message?: string | null;
}

/**
 * The service runs models on a GPU and the officer is standing at a barrier. A request
 * that has not answered in this long is not going to be useful, and the officer needs to
 * be told to type the plate instead rather than left watching a spinner.
 */
const REQUEST_TIMEOUT_MS = 15000;

export const anprAPI = {
  /**
   * Read the plate in one photo, sent as base64 JSON.
   *
   * Not multipart: Expo SDK 57's `fetch` rejects React Native's `{ uri, name, type }`
   * form-data parts with "Unsupported FormDataPart implementation". JSON has no such
   * problem, and a 1280px JPEG is small enough that base64's overhead doesn't matter.
   */
  readImageBase64: async (base64Jpeg: string): Promise<ReadResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${ANPR_API_BASE_URL}/anpr/read-base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Jpeg }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Plate reader returned ${response.status}: ${detail.slice(0, 200)}`);
      }

      return (await response.json()) as ReadResult;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('The plate reader did not respond. Type the plate in by hand.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },

  /** Whether the service is up and its models are loaded. */
  health: async (): Promise<{ status: string; models_loaded: boolean; provider?: string }> => {
    const response = await fetch(`${ANPR_API_BASE_URL}/health`);
    if (!response.ok) throw new Error(`Plate reader health check failed: ${response.status}`);
    return response.json();
  },
};
