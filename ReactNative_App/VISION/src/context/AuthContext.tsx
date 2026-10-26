/**
 * AuthContext — authentication and profile state
 *
 * Two authentication tracks, matching VISION.md section 3:
 *
 *   Visitor / Parent / Student  self-register with email + password (Google optional)
 *   Faculty / Security / Admin  sign in with an employee ID + password, admin-provisioned
 *
 * Both end in a Firebase session, so every request the app makes carries the same kind of
 * token and the backend has one verification routine.
 *
 * Two rules this file exists to enforce:
 *
 * 1. **The role comes from the backend, never from local state.** The previous version let
 *    a person pick a role on an onboarding screen and then wrote that role into the user
 *    object — and `switchRole()` went further, replacing the signed-in user with a
 *    hardcoded mock. A role chosen on the client is a request; the account's real role
 *    lives in a server-issued claim.
 *
 * 2. **Signing out ends the session.** The previous version cleared local storage and left
 *    the Firebase session live, so the next launch silently resumed as the same user.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { UserProfile } from '@/data/mockData';
import { authAPI } from '@/services/api.service';
import { firebaseAuth, AppAuthError } from '@/services/firebase.auth';

/** Roles as the backend defines them. This is the vocabulary the whole app now speaks. */
export type UserRoleType =
  | 'visitor'
  | 'parent'
  | 'student'
  | 'faculty'
  | 'security'
  | 'admin';

/** Roles a person may create for themselves. Everything else is admin-provisioned. */
export const SELF_SIGNUP_ROLES: UserRoleType[] = ['visitor', 'parent', 'student'];

export type VisitorSubtype =
  | 'general'
  | 'alumni'
  | 'vendor'
  | 'guest_faculty'
  | 'external_student';

interface SignUpDetails {
  email: string;
  password: string;
  displayName?: string;
  role: UserRoleType;
  visitorSubtype?: VisitorSubtype;
}

interface AuthContextType {
  user: UserProfile | null;
  /** The account's real role, from the backend. Null until a profile has loaded. */
  role: UserRoleType | null;
  employeeId: string | null;

  /**
   * The role a person tapped on the Role Select screen, before any account exists.
   *
   * Deliberately separate from `role`. This is an intention held during onboarding and
   * carries no authority — it is passed to the backend at signup as a request, and the
   * account's actual role comes back from the server. Conflating the two is what let the
   * old `switchRole()` turn a UI selection into an effective privilege change.
   */
  pendingRole: UserRoleType;
  pendingSubtype: VisitorSubtype;
  setPendingSignup: (role: UserRoleType, subtype?: VisitorSubtype) => void;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  mustChangePassword: boolean;
  isLoading: boolean;

  // Email track
  // These return the account's resolved role so the calling screen can redirect straight
  // away. Reading `role` from context right after `await` would still see the previous
  // render's value, since a state update is not visible until the next render.
  signUpWithEmail: (details: SignUpDetails) => Promise<UserRoleType | null>;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ role: UserRoleType | null; profile: UserProfile | null }>;
  /**
   * Pass `allowRegistration: false` from the sign-in screen: a Google account with no
   * VISION profile then throws `no-account` instead of being registered as a visitor.
   */
  signInWithGoogle: (
    role?: UserRoleType,
    visitorSubtype?: VisitorSubtype,
    allowRegistration?: boolean
  ) => Promise<{ role: UserRoleType | null; profile: UserProfile | null }>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;

  /**
   * The current Firebase ID token, refreshed on demand.
   *
   * Exposed so feature screens (the gate flow, for one) can call the backend without each
   * of them reaching into the Firebase module and re-implementing the refresh. It is
   * always fetched at the point of use rather than held in state: Firebase rotates tokens
   * roughly hourly, and a copy kept in a variable goes stale without warning.
   */
  getIdToken: (forceRefresh?: boolean) => Promise<string>;

  // Employee-ID track
  signInAsStaff: (employeeId: string, password: string) => Promise<UserRoleType | null>;
  signInAsFaculty: (username: string, password: string) => Promise<UserRoleType | null>;
  changeStaffPassword: (currentPassword: string, newPassword: string) => Promise<void>;

  logout: () => Promise<void>;

  // Profile
  updateProfile: (updated: Partial<UserProfile>) => void;
  saveIdentityDetails: (details: IdentityDetails) => Promise<void>;
  syncBiometricsToFirebase: (payload: BiometricPayload) => Promise<void>;
  completeBiometricEnrollment: () => void;
  fetchUserProfile: () => Promise<void>;
}

interface IdentityDetails {
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
}

interface BiometricPayload {
  encryptedEmbedding: string;
  modelName?: string;
  detectorBackend?: string;
  embeddingDimensions?: number;
  facesProcessed?: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The cached profile is a convenience so the app can render something on a cold start.
 * It is never treated as authoritative — the role is re-read from the backend on launch.
 */
const PROFILE_CACHE_KEY = '@vision_profile_cache';

/**
 * Tokens go in the platform keystore, not AsyncStorage, which is readable on a rooted
 * device and included in some backups.
 */
const SECURE_TOKEN_KEY = 'vision_id_token';

async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    // SecureStore is unavailable on web and on some locked-down devices. The app still
    // works: Firebase keeps its own session, so this cache is an optimisation.
    console.warn('Secure storage unavailable:', error);
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing stored, or storage unavailable. Either way there is nothing to clean up.
  }
}

function normalizeUserProfile(source: any): UserProfile {
  const id = source?.id || source?.uid || source?.username || source?.employeeId || '';
  const displayName =
    source?.displayName || source?.name || source?.email?.split('@')?.[0] || 'User';

  return {
    id,
    uid: source?.uid,
    username: source?.username || source?.employeeId,
    name: displayName,
    firstName: source?.firstName || '',
    middleName: source?.middleName || '',
    lastName: source?.lastName || '',
    phone: source?.phone || '',
    email: source?.email || '',
    // Carried through as the backend sent it. No client-side remapping: the previous
    // version collapsed unknown roles to 'requester', which quietly hid faculty and
    // security accounts behind the wrong shell.
    role: source?.role,
    employeeId: source?.employeeId,
    requesterType: source?.requesterType,
    visitorSubtype: source?.visitorSubtype,
    profilePhotoUri: source?.profilePhotoUri || source?.photoURL || '',
    biometricEnrolled: Boolean(source?.biometricEnrolled),
    govtIdType: source?.identityProof?.idType || source?.govtIdType,
    govtIdMasked: source?.govtIdMasked,
    identityProof: source?.identityProof || null,
    linkedStudents: source?.linkedStudents,
    department: source?.department,
    designation: source?.designation,
    isMentor: source?.isMentor,
  } as UserProfile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRoleType | null>(null);
  const [pendingRole, setPendingRole] = useState<UserRoleType>('visitor');
  const [pendingSubtype, setPendingSubtype] = useState<VisitorSubtype>('general');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Current ID token, refreshed on demand.
   *
   * Always asked for at the point of use rather than held in state: Firebase rotates
   * tokens roughly hourly, and a copy kept in a variable goes stale without warning.
   */
  const getToken = useCallback(async (forceRefresh = false): Promise<string> => {
    const token = await firebaseAuth.getIdToken(forceRefresh);
    if (!token) throw new Error('Not signed in');
    await secureSet(SECURE_TOKEN_KEY, token);
    return token;
  }, []);

  /**
   * Load the profile from the backend and adopt the role it reports.
   * Returns the role as well as storing it, so callers can act on it immediately.
   */
  const loadProfile = useCallback(async (): Promise<{
    profile: UserProfile;
    role: UserRoleType | null;
  } | null> => {
    let token = await getToken();
    let result = await authAPI.getProfile(token);

    // If the token was stale (rotated hourly, or backend restarted), retry once
    // with a force-refreshed token before giving up.
    if (!result.success && result.status === 401) {
      token = await getToken(true);
      result = await authAPI.getProfile(token);
    }

    if (!result.success || !result.data?.user) return null;

    const profile = normalizeUserProfile(result.data.user);
    const loadedRole = (result.data.user.role as UserRoleType) ?? null;

    setUser(profile);
    setRole(loadedRole);
    setEmployeeId(result.data.user.employeeId ?? null);
    // Staff profiles carry it; requester profiles do not, which reads as false. Restored
    // here so a relaunch still lands on Change password until it is done.
    setMustChangePassword(Boolean(result.data.user.mustChangePassword));

    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    return { profile, role: loadedRole };
  }, [getToken]);

  /**
   * Restore state on launch from whatever Firebase says the session is.
   *
   * Firebase is the source of truth here, not local storage. If the session has ended —
   * signed out elsewhere, credentials revoked, staff account deactivated — this reports
   * signed-out even when a cached profile is still on disk.
   */
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setRole(null);
          setEmployeeId(null);
          setIsAuthenticated(false);
          setIsEmailVerified(false);
          await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
          await secureDelete(SECURE_TOKEN_KEY);
          return;
        }

        setIsAuthenticated(true);
        setIsEmailVerified(firebaseUser.emailVerified);

        // Show the cached profile immediately so the first frame is not a spinner, then
        // replace it with the server's version.
        const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
        if (cached) setUser(normalizeUserProfile(JSON.parse(cached)));

        await loadProfile();
      } catch (error) {
        console.error('Failed to restore session:', error);
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, [loadProfile]);

  /**
   * Register the Firebase account with the backend, which creates the profile and writes
   * the role claim. Called after every first-time sign-in on the email track.
   */
  const registerWithBackend = async (
    requestedRole: UserRoleType,
    visitorSubtype?: VisitorSubtype
  ): Promise<UserRoleType | null> => {
    // Force a refresh so the token is current before the backend inspects it.
    const token = await getToken(true);

    const result = await authAPI.register(token, {
      role: requestedRole,
      requesterType:
        requestedRole === 'parent'
          ? 'parent_guardian'
          : requestedRole === 'student'
            ? undefined
            : 'visitor',
      visitorSubtype: requestedRole === 'visitor' ? visitorSubtype || 'general' : undefined,
    });

    if (!result.success) {
      throw new Error(result.error || result.message || 'Registration failed');
    }

    // The claim was just written server-side, so the token in hand predates it. Refresh
    // before reading the profile, or the role check on the next request uses the old one.
    await getToken(true);
    return (await loadProfile())?.role ?? null;
  };

  const signUpWithEmail = async (details: SignUpDetails): Promise<UserRoleType | null> => {
    if (!SELF_SIGNUP_ROLES.includes(details.role)) {
      // Guarded here as well as on the server, so the UI cannot even ask.
      throw new AppAuthError('unknown', 'That role cannot be created by signing up');
    }

    try {
      setIsLoading(true);
      await firebaseAuth.signUpWithEmail(details.email, details.password, details.displayName);
      return await registerWithBackend(details.role, details.visitorSubtype);
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithEmail = async (
    email: string,
    password: string
  ): Promise<{ role: UserRoleType | null; profile: UserProfile | null }> => {
    try {
      setIsLoading(true);
      await firebaseAuth.signInWithEmail(email, password);
      // No role is passed: an existing account's role comes back from the backend.
      const existing = await loadProfile();
      if (!existing) {
        // A Firebase login with no VISION profile behind it: registration never finished.
        // Sign-in does not create accounts, so end the session and send them to sign-up.
        await firebaseAuth.signOut();
        throw new AppAuthError('no-account', 'No VISION account exists for this sign-in yet');
      }
      return { role: existing.role, profile: existing.profile };
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async (
    requestedRole: UserRoleType = 'visitor',
    visitorSubtype?: VisitorSubtype,
    allowRegistration = true
  ): Promise<{ role: UserRoleType | null; profile: UserProfile | null }> => {
    try {
      setIsLoading(true);
      await firebaseAuth.signInWithGoogle();

      // A Google account may be new here or returning. Try the profile first; register
      // only if there isn't one, so a returning user's role is never overwritten by
      // whatever card they happened to tap.
      const existing = await loadProfile();
      if (existing) return { role: existing.role, profile: existing.profile };

      // From the sign-in screen, no account means sign-up, not a silent registration.
      // Registering here would create a visitor account the person never chose a role for.
      if (!allowRegistration) {
        await firebaseAuth.signOut();
        throw new AppAuthError('no-account', 'No VISION account exists for this Google account');
      }

      const registeredRole = await registerWithBackend(requestedRole, visitorSubtype);
      const newProfile = await loadProfile();
      return { role: registeredRole, profile: newProfile?.profile ?? null };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Employee-ID sign-in.
   *
   * Two steps: the backend verifies the credential and mints a custom token, then the app
   * exchanges that for a Firebase session. From then on a staff member's requests are
   * indistinguishable from anyone else's.
   */
  const signInAsStaff = async (
    staffId: string,
    password: string
  ): Promise<UserRoleType | null> => {
    try {
      setIsLoading(true);

      const result = await authAPI.staffLogin(staffId, password);

      if (!result.success || !result.data?.customToken) {
        throw new AppAuthError(
          'invalid-credentials',
          result.message || result.error || 'Employee ID or password is incorrect'
        );
      }

      await firebaseAuth.signInWithCustomToken(result.data.customToken);

      const staff = result.data.user;
      setRole(staff.role as UserRoleType);
      setEmployeeId(staff.employeeId);
      setMustChangePassword(Boolean(staff.mustChangePassword));
      setIsAuthenticated(true);
      // Staff accounts have no self-verified address, so verification does not gate them.
      setIsEmailVerified(true);

      const profile = normalizeUserProfile({
        uid: staff.uid,
        displayName: staff.displayName,
        role: staff.role,
        department: staff.department,
        employeeId: staff.employeeId,
      });
      setUser(profile);
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));

      return staff.role as UserRoleType;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Faculty sign-in using university institutional username/credentials.
   */
  const signInAsFaculty = async (
    username: string,
    password: string
  ): Promise<UserRoleType | null> => {
    try {
      setIsLoading(true);

      const result = await authAPI.facultyLogin(username, password);

      if (!result.success || !result.data?.customToken) {
        throw new AppAuthError(
          'invalid-credentials',
          result.message || result.error || 'Username or password is incorrect'
        );
      }

      await firebaseAuth.signInWithCustomToken(result.data.customToken);

      const faculty = result.data.user;
      setRole(faculty.role as UserRoleType);
      setEmployeeId(faculty.employeeId);
      setMustChangePassword(Boolean(faculty.mustChangePassword));
      setIsAuthenticated(true);
      setIsEmailVerified(true);

      const profile = normalizeUserProfile({
        uid: faculty.uid,
        username: username, // Store the faculty username
        displayName: faculty.displayName,
        role: faculty.role,
        department: faculty.department,
        employeeId: faculty.employeeId,
      });
      setUser(profile);
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));

      return faculty.role as UserRoleType;
    } finally {
      setIsLoading(false);
    }
  };

  const changeStaffPassword = async (currentPassword: string, newPassword: string) => {
    const token = await getToken();
    const result = await authAPI.changeStaffPassword(token, currentPassword, newPassword);

    if (!result.success) {
      throw new AppAuthError(
        'invalid-credentials',
        result.error || result.message || 'Current password is incorrect'
      );
    }

    setMustChangePassword(false);
  };

  const sendPasswordReset = async (email: string) => {
    await firebaseAuth.sendPasswordReset(email);
  };

  const resendVerificationEmail = async () => {
    await firebaseAuth.resendVerificationEmail();
  };

  const refreshEmailVerification = async (): Promise<boolean> => {
    const verified = await firebaseAuth.reloadUser();
    setIsEmailVerified(verified);
    return verified;
  };

  /**
   * End the session — Firebase and Google as well as local state. The auth-state listener
   * above does the clearing, so this only has to sign out.
   */
  const logout = async () => {
    try {
      setIsLoading(true);
      
      // Clear state immediately to prevent race conditions
      setUser(null);
      setRole(null);
      setEmployeeId(null);
      setIsAuthenticated(false);
      setIsEmailVerified(false);
      setMustChangePassword(false);
      
      // Clear storage
      await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
      await secureDelete(SECURE_TOKEN_KEY);
      
      // Sign out from Firebase
      await firebaseAuth.signOut();
    } catch (error) {
      console.error('Sign-out error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const persistProfile = async (updated: UserProfile) => {
    setUser(updated);
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(updated));
  };

  /**
   * Local-only profile edit, for fields the user is still filling in during onboarding.
   * `role` is deliberately stripped: the backend owns it.
   */
  const updateProfile = (updated: Partial<UserProfile>) => {
    if (!user) return;
    const { role: _ignoredRole, ...safe } = updated as any;
    void persistProfile({ ...user, ...safe });
  };

  const saveIdentityDetails = async (details: IdentityDetails) => {
    try {
      setIsLoading(true);
      const token = await getToken();
      const res = await authAPI.updateProfile(token, details);

      if (!res.success || !res.data?.user) {
        throw new Error(res.error || res.message || 'Could not save your details');
      }

      await persistProfile(normalizeUserProfile(res.data.user));
    } finally {
      setIsLoading(false);
    }
  };

  const syncBiometricsToFirebase = async (payload: BiometricPayload) => {
    const token = await getToken();
    const res = await authAPI.syncBiometrics(token, payload);

    if (!res.success) {
      throw new Error(res.error || res.message || 'Could not save your biometric enrolment');
    }

    if (user) await persistProfile({ ...user, biometricEnrolled: true });
  };

  const completeBiometricEnrollment = () => {
    if (!user) return;
    void persistProfile({ ...user, biometricEnrolled: true });
  };

  const fetchUserProfile = async () => {
    await loadProfile();
  };

  const setPendingSignup = (nextRole: UserRoleType, subtype?: VisitorSubtype) => {
    setPendingRole(nextRole);
    if (subtype) setPendingSubtype(subtype);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        employeeId,
        pendingRole,
        pendingSubtype,
        setPendingSignup,
        isAuthenticated,
        isEmailVerified,
        mustChangePassword,
        isLoading,
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        sendPasswordReset,
        resendVerificationEmail,
        refreshEmailVerification,
        getIdToken: getToken,
        signInAsStaff,
        signInAsFaculty,
        changeStaffPassword,
        logout,
        updateProfile,
        saveIdentityDetails,
        syncBiometricsToFirebase,
        completeBiometricEnrollment,
        fetchUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Which route group a role belongs in.
 *
 * One mapping, used by the post-sign-in redirect and by every group's layout guard, so
 * the two cannot disagree about where a role is allowed to be.
 */
export function homeRouteForRole(userRole: UserRoleType | null): string {
  switch (userRole) {
    case 'faculty':
      return '/(faculty)/inbox';
    case 'security':
      return '/(security)/home';
    case 'admin':
      return '/(admin)/overview';
    case 'student':
      return '/(student)/home';
    case 'visitor':
    case 'parent':
      return '/(main)/home';
    default:
      return '/(onboarding)/splash';
  }
}
