/**
 * Firebase Authentication wrapper — browser version.
 *
 * Metro picks this file instead of `firebase.auth.ts` when the app is bundled for the web,
 * which is how the admin console runs on a laptop (`npx expo start --web`). The native
 * file uses @react-native-firebase, which has no browser build; this one implements the
 * same `firebaseAuth` API with the Firebase JS SDK. Everything above it — AuthContext,
 * the staff sign-in screen, every API call — is shared unchanged.
 *
 * The web config is read from EXPO_PUBLIC_FIREBASE_*. These values are public identifiers
 * (they ship in every web app that uses Firebase), not secrets; access is controlled by the
 * backend and by Firestore rules, not by hiding them.
 *
 * Google sign-in is not offered in the browser: the console is for staff, who sign in with
 * an employee ID.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth as getWebAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken as fbSignInWithCustomToken,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  reload,
  getIdToken as fbGetIdToken,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';

/** Errors surfaced to the UI. Kept identical to the native file. */
export type AuthErrorCode =
  | 'invalid-credentials'
  | 'email-in-use'
  | 'weak-password'
  | 'invalid-email'
  | 'too-many-requests'
  | 'network'
  | 'cancelled'
  | 'no-account'
  | 'unknown';

export class AppAuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppAuthError';
  }
}

let authInstance: Auth | null = null;

function getAuth(): Auth {
  if (authInstance) return authInstance;

  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.projectId) {
    throw new AppAuthError(
      'unknown',
      'The browser build needs EXPO_PUBLIC_FIREBASE_API_KEY, _AUTH_DOMAIN, _PROJECT_ID and _APP_ID in .env (Firebase console → Project settings → Your apps → Web app). Restart Metro with --clear after adding them.'
    );
  }

  const app = getApps().length ? getApp() : initializeApp(config);
  authInstance = getWebAuth(app);
  return authInstance;
}

function mapAuthError(error: any): AppAuthError {
  if (error instanceof AppAuthError) return error;
  const code: string = error?.code || '';

  switch (code) {
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return new AppAuthError('invalid-credentials', 'Email or password is incorrect');
    case 'auth/email-already-in-use':
      return new AppAuthError('email-in-use', 'This address is already registered');
    case 'auth/weak-password':
      return new AppAuthError('weak-password', 'Choose a longer password (at least 8 characters)');
    case 'auth/invalid-email':
      return new AppAuthError('invalid-email', 'That does not look like a valid email address');
    case 'auth/too-many-requests':
      return new AppAuthError('too-many-requests', 'Too many attempts. Wait a few minutes and try again.');
    case 'auth/network-request-failed':
      return new AppAuthError('network', 'No connection. Check your network and try again.');
    default:
      return new AppAuthError('unknown', error?.message || 'Sign-in failed');
  }
}

async function signUpWithEmail(email: string, password: string, displayName?: string) {
  try {
    const credential = await createUserWithEmailAndPassword(getAuth(), email.trim(), password);
    if (displayName) await updateProfile(credential.user, { displayName });
    await sendEmailVerification(credential.user);
    return credential.user;
  } catch (error) {
    throw mapAuthError(error);
  }
}

async function signInWithEmail(email: string, password: string) {
  try {
    const credential = await signInWithEmailAndPassword(getAuth(), email.trim(), password);
    return credential.user;
  } catch (error) {
    throw mapAuthError(error);
  }
}

/** The employee-ID track's second step: exchange the backend's custom token for a session. */
async function signInWithCustomToken(customToken: string) {
  try {
    const credential = await fbSignInWithCustomToken(getAuth(), customToken);
    return credential.user;
  } catch (error) {
    throw mapAuthError(error);
  }
}

async function signInWithGoogle(): Promise<User> {
  // 'unknown', not 'cancelled': the sign-in screens stay silent on 'cancelled' (the person
  // closed the Google sheet themselves), which here would leave a button that does nothing.
  throw new AppAuthError(
    'unknown',
    'Google sign-in is available in the mobile app. In the browser, sign in with your employee ID or email.'
  );
}

async function getIdToken(forceRefresh = false): Promise<string | null> {
  let currentUser: User | null = null;
  try {
    currentUser = getAuth().currentUser;
  } catch {
    return null;
  }
  if (!currentUser) return null;
  return fbGetIdToken(currentUser, forceRefresh);
}

function getCurrentUser(): User | null {
  try {
    return getAuth().currentUser;
  } catch {
    return null;
  }
}

async function reloadUser(): Promise<boolean> {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;
  await reload(currentUser);
  return getAuth().currentUser?.emailVerified ?? false;
}

async function resendVerificationEmail(): Promise<void> {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new AppAuthError('unknown', 'Not signed in');
  await sendEmailVerification(currentUser);
}

async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getAuth(), email.trim());
  } catch (error: any) {
    // Same rule as native: do not reveal which addresses hold an account.
    if (error?.code === 'auth/user-not-found') return;
    throw mapAuthError(error);
  }
}

async function signOut(): Promise<void> {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  await fbSignOut(getAuth());
}

function onAuthStateChanged(callback: (user: User | null) => void) {
  try {
    return fbOnAuthStateChanged(getAuth(), callback);
  } catch (error) {
    // Missing web config: report "signed out" so the sign-in screen can show the reason.
    console.error((error as Error).message);
    callback(null);
    return () => {};
  }
}

export const firebaseAuth = {
  signUpWithEmail,
  signInWithEmail,
  signInWithCustomToken,
  signInWithGoogle,
  getIdToken,
  getCurrentUser,
  reloadUser,
  resendVerificationEmail,
  sendPasswordReset,
  signOut,
  onAuthStateChanged,
};
