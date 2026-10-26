/**
 * Firebase Admin SDK Configuration
 * 
 * Initializes Firebase Admin for server-side operations:
 * - User authentication verification
 * - Firestore database operations
 * - Cloud Storage access
 */

import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { Auth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';
import { DecodedToken } from '../types';

dotenv.config();

let firebaseApp: admin.app.App;
let db: Firestore;
let auth: Auth;

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase(): { app: admin.app.App; db: Firestore; auth: Auth } {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      console.log('✅ Firebase Admin already initialized');
      firebaseApp = admin.app();
      db = admin.firestore();
      auth = admin.auth();
      return { app: firebaseApp, db, auth };
    }

    // Prefer a service account key file when one is actually present.
    //
    // The file being *named* in the environment is not the same as it existing — the
    // default .env names ./serviceAccountKey.json whether or not anyone put one there.
    // Treating a missing file as fatal meant the server refused to start even when
    // perfectly good credentials were sitting in FIREBASE_PRIVATE_KEY below.
    const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    let serviceAccount: admin.ServiceAccount | null = null;

    if (keyFilePath) {
      try {
        serviceAccount = require(`../../${keyFilePath}`);
      } catch {
        console.warn(
          `⚠️  Service account key not found at ${keyFilePath}; falling back to environment variables`
        );
      }
    }

    if (serviceAccount) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'vision-1caa0.firebasestorage.app',
      });

      console.log('✅ Firebase Admin initialized with service account key file');
    }
    // Initialize with environment variables
    else if (process.env.FIREBASE_PRIVATE_KEY) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        // Also set at the app level, not only inside the credential, so the startup log
        // below reports the real project instead of "undefined".
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'vision-1caa0.firebasestorage.app',
      });

      console.log('✅ Firebase Admin initialized with environment variables');
    }
    else {
      throw new Error('Firebase credentials not found in environment variables');
    }

    // Initialize Firestore and Auth
    db = admin.firestore();
    auth = admin.auth();

    // Firestore settings
    db.settings({
      timestampsInSnapshots: true,
    });

    console.log('✅ Firestore and Auth initialized successfully');
    console.log('🔍 Firebase Project ID:', firebaseApp.options.projectId);
    console.log('🔍 Firestore Database:', db.databaseId || '(default)');

    return { app: firebaseApp, db, auth };
  } catch (error) {
    console.error('❌ Firebase initialization error:', (error as Error).message);
    console.error('Make sure your service account key is properly configured');
    throw error;
  }
}

/**
 * Get Firestore database instance
 */
function getFirestore(): Firestore {
  if (!db) {
    initializeFirebase();
  }
  return db;
}

/**
 * Get Firebase Auth instance
 */
function getAuth(): Auth {
  if (!auth) {
    initializeFirebase();
  }
  return auth;
}

/**
 * Get Firebase Storage instance
 */
function getStorage(): admin.storage.Storage {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.storage();
}

/**
 * Verify a Firebase ID token from a client.
 *
 * This is the ONLY place a caller's identity is established, so it does exactly one
 * thing: check the token's signature against Firebase's public keys.
 *
 * There is deliberately no fallback path. An earlier version, when verification failed,
 * base64-decoded the token payload and trusted its `sub` claim — which meant an
 * unsigned token carrying any known user id authenticated as that user. Any such
 * fallback turns every other access control in this service into decoration, so if
 * verification fails here, the request fails.
 */
async function verifyIdToken(idToken: string): Promise<DecodedToken> {
  try {
    // `checkRevoked` makes deactivating a staff account or suspending a user take effect on
    // the next request (PRD.md FR-ADM-07), instead of when the holder's current ID token
    // expires up to an hour later. It also rejects tokens of disabled accounts. The cost
    // is one Auth lookup per request.
    const decodedToken = await getAuth().verifyIdToken(idToken, true);
    return decodedToken as DecodedToken;
  } catch (error) {
    // Logged server-side for diagnosis; the caller is told nothing beyond "invalid",
    // so a probe cannot learn why a token was rejected.
    console.error('Token verification failed:', (error as Error).message);
    throw new Error('Invalid or expired token');
  }
}

export {
  initializeFirebase,
  getFirestore,
  getAuth,
  getStorage,
  verifyIdToken,
  admin,
};
