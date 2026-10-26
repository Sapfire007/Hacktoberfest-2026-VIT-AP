/**
 * Firebase Authentication wrapper
 *
 * The only module in the app that touches Firebase directly. Everything else goes through
 * AuthContext, so if the identity provider is ever swapped this is the one file to rewrite.
 *
 * Its single responsibility is producing a **Firebase ID token**. All three sign-in paths
 * converge on one, which is what lets the backend run a single verification routine:
 *
 *   email + password  ->  signInWithEmailAndPassword  ->  getIdToken()
 *   Google (optional) ->  signInWithCredential        ->  getIdToken()
 *   employee ID       ->  backend mints a custom token -> signInWithCustomToken -> getIdToken()
 *
 * The app used to send a raw *Google* ID token to a backend that calls Firebase Admin's
 * verifyIdToken, which only accepts *Firebase* ID tokens — so it could never succeed. That
 * mismatch is why nothing here returns a provider token to a caller.
 *
 * Requires a development build. These are native modules and cannot run in Expo Go
 * (VISION.md ADR-005).
 */

// @react-native-firebase v26 ships the modular API only — the old namespaced `auth()`
// default export was removed. Every call below takes the Auth instance explicitly.
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken as fbSignInWithCustomToken,
  signInWithCredential,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  reload,
  getIdToken as fbGetIdToken,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  GoogleAuthProvider,
  type User,
} from '@react-native-firebase/auth';

/** Errors surfaced to the UI. Keep these mapped in one place, not per screen. */
export type AuthErrorCode =
  | 'invalid-credentials'
  | 'email-in-use'
  | 'weak-password'
  | 'invalid-email'
  | 'too-many-requests'
  | 'network'
  | 'cancelled'
  /** Authenticated with Firebase, but no VISION account exists — sign-up is needed. */
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

/**
 * Map Firebase's error codes to something a person can act on.
 *
 * `wrong-password` and `user-not-found` deliberately collapse into one message: telling a
 * caller which of the two it was confirms whether an address is registered.
 */
function mapAuthError(error: any): AppAuthError {
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
      return new AppAuthError(
        'too-many-requests',
        'Too many attempts. Wait a few minutes and try again.'
      );
    case 'auth/network-request-failed':
      return new AppAuthError('network', 'No connection. Check your network and try again.');
    default:
      return new AppAuthError('unknown', error?.message || 'Sign-in failed');
  }
}

/** Create an account with an email address and password, and send a verification email. */
async function signUpWithEmail(email: string, password: string, displayName?: string) {
  try {
    const credential = await createUserWithEmailAndPassword(getAuth(), email.trim(), password);

    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }

    // Fired here rather than on a later screen so the message is already waiting by the
    // time the person finishes the rest of onboarding.
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

/**
 * Exchange a backend-issued custom token for a Firebase session.
 * This is the employee-ID track's second step — see staffLogin in api.service.ts.
 */
async function signInWithCustomToken(customToken: string) {
  try {
    const credential = await fbSignInWithCustomToken(getAuth(), customToken);
    return credential.user;
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Optional "Sign in with Google".
 *
 * Loaded lazily so a build without the Google module configured still runs — the button is
 * a convenience, and nothing else in the app depends on it working.
 */
async function signInWithGoogle() {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');

    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      offlineAccess: true,
    });

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();

    const googleIdToken = result?.data?.idToken || result?.idToken;
    if (!googleIdToken) {
      throw new AppAuthError('cancelled', 'Google sign-in was cancelled');
    }

    // The Google token is exchanged for a Firebase session here and never leaves this
    // function. Only the resulting Firebase ID token is sent to the backend.
    const googleCredential = GoogleAuthProvider.credential(googleIdToken);
    const credential = await signInWithCredential(getAuth(), googleCredential);

    return credential.user;
  } catch (error: any) {
    if (error instanceof AppAuthError) throw error;
    // Google's own cancellation codes, which are not failures worth an error dialog.
    if (error?.code === '12501' || error?.code === 'SIGN_IN_CANCELLED') {
      throw new AppAuthError('cancelled', 'Google sign-in was cancelled');
    }
    throw mapAuthError(error);
  }
}

/**
 * Current session's ID token.
 *
 * `forceRefresh` matters after the server changes a role claim — without it the app keeps
 * using a cached token carrying the old role for up to an hour.
 */
async function getIdToken(forceRefresh = false): Promise<string | null> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) return null;
  return fbGetIdToken(currentUser, forceRefresh);
}

function getCurrentUser(): User | null {
  return getAuth().currentUser;
}

/** Re-read verification state from the server rather than from the cached user object. */
async function reloadUser(): Promise<boolean> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) return false;
  await reload(currentUser);
  return getAuth().currentUser?.emailVerified ?? false;
}

async function resendVerificationEmail(): Promise<void> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) throw new AppAuthError('unknown', 'Not signed in');
  await sendEmailVerification(currentUser);
}

async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getAuth(), email.trim());
  } catch (error: any) {
    // "User not found" is swallowed: reporting it would let anyone test which addresses
    // hold an account. The caller shows the same confirmation either way.
    if (error?.code === 'auth/user-not-found') return;
    throw mapAuthError(error);
  }
}

/**
 * End the session properly.
 *
 * Signs out of Firebase and Google, not just the app's own cache. The previous
 * implementation cleared local storage only, which left the Firebase session live — the
 * next launch silently resumed as the same user.
 */
async function signOut(): Promise<void> {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    if (await GoogleSignin.hasPreviousSignIn?.()) {
      await GoogleSignin.signOut();
    }
  } catch {
    // Google was never used, or the module is absent in this build. Not a reason to
    // block the Firebase sign-out below.
  }

  // Already signed out — the session expired or was ended elsewhere. The goal state is
  // reached, so there is nothing to do; Firebase would otherwise throw auth/no-current-user.
  if (!getAuth().currentUser) return;

  await fbSignOut(getAuth());
}

function onAuthStateChanged(callback: (user: User | null) => void) {
  return fbOnAuthStateChanged(getAuth(), callback);
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
