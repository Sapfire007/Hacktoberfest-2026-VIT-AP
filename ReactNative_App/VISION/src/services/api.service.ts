/**
 * API Service
 *
 * Handles all HTTP communication with the backend API.
 * Frontend makes NO direct Firebase/Firestore calls - all data operations go through backend.
 *
 * Backend API Base URL is configured in .env.
 */

import { API_BASE_URL, getBackendOrigin } from '@/config/backend';

/**
 * Generic API request wrapper with error handling
 */
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  /**
   * HTTP statuses that are an expected answer for this endpoint rather than a failure.
   * They still return `success: false`, but are not logged as errors — `console.error`
   * raises a red on-screen toast in development, which is wrong for a normal outcome.
   */
  expectedStatuses: number[] = []
): Promise<{ success: boolean; data?: T; error?: string; message?: string; status?: number }> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`[API] ${options.method || 'GET'} ${endpoint}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();
    console.log(`[API] ${endpoint} → status ${response.status}:`, data);

    if (!response.ok) {
      if (expectedStatuses.includes(response.status)) {
        return {
          success: false,
          status: response.status,
          error: data.error || 'Request failed',
          message: data.message,
        };
      }
      throw new Error(data.message || data.error || 'Request failed');
    }

    return data;
  } catch (error: any) {
    console.error(`API Request Error [${endpoint}]:`, error.message);
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

/**
 * Authentication API calls
 */
export const authAPI = {
  /**
   * Register or sign in a self-service account with the backend.
   *
   * `idToken` must be a **Firebase** ID token from firebaseAuth.getIdToken(), not a
   * provider token. The backend verifies it with Firebase Admin, which accepts nothing
   * else.
   *
   * `role` is a request, not an instruction: the backend clamps it to
   * visitor | parent | student and ignores anything else.
   */
  register: async (idToken: string, userData: {
    role?: string;
    requesterType?: string;
    visitorSubtype?: string;
  }) => {
    return apiRequest('/auth/register', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(userData),
    });
  },

  /**
   * Employee-ID sign-in for faculty, security and admin.
   *
   * The only call in the app that sends a password. It returns a Firebase custom token,
   * which the caller exchanges for a session via firebaseAuth.signInWithCustomToken —
   * after which a staff member's requests look exactly like anyone else's.
   */
  staffLogin: async (employeeId: string, password: string) => {
    // 400/401/403/423 are answers (bad input, wrong password, deactivated, locked), shown on
    // the sign-in screen - not failures to raise as a red error in development.
    return apiRequest(
      '/auth/staff/login',
      { method: 'POST', body: JSON.stringify({ employeeId, password }) },
      [400, 401, 403, 423]
    );
  },

  /**
   * Dedicated faculty sign-in for teachers, professors and mentors.
   */
  facultyLogin: async (username: string, password: string) => {
    return apiRequest(
      '/auth/faculty/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
      [400, 401, 403, 423]
    );
  },

  /** Change one's own staff password. The employee ID is taken from the token server-side. */
  changeStaffPassword: async (idToken: string, currentPassword: string, newPassword: string) => {
    return apiRequest('/auth/staff/password', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  /** Staff profile: employee ID, role, department. */
  getStaffProfile: async (idToken: string) => {
    return apiRequest('/auth/staff/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    });
  },

  /**
   * Login existing user
   */
  login: async (idToken: string) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({}),
    });
  },

  /**
   * Get current user profile from backend
   */
  getProfile: async (idToken: string) => {
    // 404 is expected (new user with no profile yet); 401 is expected after a token
    // rotation or backend restart — the AuthContext retries with a force-refreshed token.
    return apiRequest(
      '/auth/me',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      },
      [404, 401]
    );
  },

  /**
   * Update personal identity details and identity proof in Firestore
   */
  updateProfile: async (idToken: string, profileData: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    phone: string;
    identityProof: {
      idType: string;
      documentName: string;
      mimeType: string;
      fileSize?: number;
      documentUri?: string;
      storageUri?: string | null;
    };
  }) => {
    return apiRequest('/auth/profile', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(profileData),
    });
  },

  /**
   * Upload identity proof document to Cloud Storage / Firestore
   */
  uploadIdDocument: async (idToken: string, payload: {
    fileData: string;
    fileName: string;
    mimeType: string;
    idType: string;
  }) => {
    return apiRequest('/auth/upload-id-document', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
  },

  /**
   * Persist facial biometric vector & DeepFace metadata in Cloud Firestore
   */
  syncBiometrics: async (idToken: string, biometricData: {
    encryptedEmbedding: string;
    modelName?: string;
    detectorBackend?: string;
    embeddingDimensions?: number;
    facesProcessed?: number;
  }) => {
    return apiRequest('/auth/biometrics', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(biometricData),
    });
  },
};

/**
 * Health check - verify backend is running
 */
export const healthCheck = async () => {
  try {
    const response = await fetch(`${getBackendOrigin(API_BASE_URL)}/health`);
    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    return { success: false, error: 'Backend not reachable' };
  }
};

/**
 * User Profile API calls
 * (To be implemented as backend endpoints are added)
 */
export const userAPI = {
  updateProfile: async (idToken: string, updates: any) => {
    return apiRequest('/users/profile', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(updates),
    });
  },
};

const bearer = (idToken: string) => ({ Authorization: `Bearer ${idToken}` });

/**
 * Visit requests — /api/visits.
 *
 * The server decides who the caller is and what they may do from the token. None of these
 * calls sends a requester id or a faculty id to act as.
 */
export const visitAPI = {
  create: (idToken: string, body: Record<string, unknown>) =>
    apiRequest('/visits', { method: 'POST', headers: bearer(idToken), body: JSON.stringify(body) }),

  mine: (idToken: string) => {
    console.log('[visitAPI.mine] Calling with token:', idToken?.substring(0, 50) + '...');
    return apiRequest('/visits/mine', { headers: bearer(idToken) });
  },

  inbox: (idToken: string, scope: 'pending' | 'all') => {
    console.log(`[visitAPI.inbox] Calling scope=${scope} with token:`, idToken?.substring(0, 50) + '...');
    return apiRequest(`/visits/inbox?scope=${scope}`, { headers: bearer(idToken) });
  },

  get: (idToken: string, id: string) =>
    apiRequest(`/visits/${encodeURIComponent(id)}`, { headers: bearer(idToken) }, [404]),

  approve: (idToken: string, id: string, remarks?: string) =>
    apiRequest(`/visits/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: bearer(idToken),
      body: JSON.stringify({ remarks }),
    }),

  reject: (idToken: string, id: string, remarks: string) =>
    apiRequest(`/visits/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: bearer(idToken),
      body: JSON.stringify({ remarks }),
    }),

  cancel: (idToken: string, id: string) =>
    apiRequest(`/visits/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: bearer(idToken),
    }),
};

/**
 * Faculty directory — /api/faculty. Returns an allow-listed set of fields only.
 */
export const facultyAPI = {
  page: (idToken: string, cursor?: string, limit = 50) =>
    apiRequest(
      `/faculty?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { headers: bearer(idToken) }
    ),

  search: (idToken: string, query: string) =>
    apiRequest(`/faculty/search?q=${encodeURIComponent(query)}`, { headers: bearer(idToken) }),

  me: (idToken: string) => apiRequest('/faculty/me', { headers: bearer(idToken) }, [404]),

  get: (idToken: string, id: string) =>
    apiRequest(`/faculty/${encodeURIComponent(id)}`, { headers: bearer(idToken) }, [404]),
};

/**
 * Vehicle API calls
 * (To be implemented as backend endpoints are added)
 */
export const vehicleAPI = {
  addVehicle: async (idToken: string, vehicleData: any) => {
    return apiRequest('/vehicles', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(vehicleData),
    });
  },

  getVehicles: async (idToken: string) => {
    return apiRequest('/vehicles', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    });
  },
};

export default {
  auth: authAPI,
  user: userAPI,
  visit: visitAPI,
  vehicle: vehicleAPI,
  healthCheck,
};
