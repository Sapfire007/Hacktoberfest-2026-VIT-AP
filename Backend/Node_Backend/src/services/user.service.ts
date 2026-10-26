/**
 * User Service
 * 
 * Handles all user-related business logic:
 * - User registration and profile creation
 * - Email verification and validation
 * - User data retrieval and updates
 */

import { getFirestore } from '../config/firebase.admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  UserProfile,
  RegisterUserData,
  PaginatedResponse,
  IdentityProof,
  BiometricRecord,
} from '../types';

const USERS_COLLECTION = process.env.FIRESTORE_COLLECTION_USERS || 'users';
const BIOMETRICS_COLLECTION = process.env.FIRESTORE_COLLECTION_BIOMETRICS || 'biometrics';

/**
 * Create or update user profile in Firestore
 */
async function createOrUpdateUser(userData: RegisterUserData): Promise<UserProfile> {
  try {
    const db = getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(userData.uid);

    const timestamp = FieldValue.serverTimestamp();

    // Read first, so a re-registration (which happens on every sign-in) cannot undo
    // anything the user has since completed.
    const existing = await userRef.get();
    const isNew = !existing.exists;

    // Always use merge: true to create or update
    const newUser: Partial<UserProfile> = {
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName || userData.email.split('@')[0],
      photoURL: userData.photoURL || null,
      role: userData.role || 'visitor',
      requesterType: userData.requesterType ?? 'visitor',
      visitorSubtype: userData.visitorSubtype || null,
      status: 'active',
      emailVerified: userData.emailVerified || false,
      firstName: userData.firstName || null,
      middleName: userData.middleName || null,
      lastName: userData.lastName || null,
      phone: userData.phone || null,
      identityProof: userData.identityProof || null,
      govtIdUploaded: Boolean(userData.identityProof),
      profileComplete: Boolean(userData.firstName && userData.lastName && userData.phone),
      lastLoginAt: timestamp,
      updatedAt: timestamp,
    };

    if (isNew) {
      // `createdAt` was previously never written to the document — only faked in the
      // returned object — which silently broke getAllUsers, since it orders by that
      // field and Firestore omits documents that lack it.
      newUser.createdAt = timestamp;
      // Only ever set on creation. Writing it unconditionally reset the flag on every
      // sign-in, marking enrolled users as un-enrolled.
      newUser.biometricEnrolled = false;
    }

    // Use set with merge to create or update without clobbering fields set elsewhere
    await userRef.set(newUser, { merge: true });

    console.log(`✅ User ${isNew ? 'created' : 'updated'}: ${userData.email}`);

    // Read back rather than guessing, so the caller gets the real server timestamps and
    // any fields (biometric enrolment, profile details) this call did not touch.
    const saved = await userRef.get();
    return { uid: userData.uid, ...saved.data() } as UserProfile;
  } catch (error) {
    console.error('❌ Error in createOrUpdateUser:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Failed to create/update user: ${(error as Error).message}`);
  }
}

/**
 * Get user by UID
 */
async function getUserByUid(uid: string): Promise<UserProfile | null> {
  try {
    const db = getFirestore();
    const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();

    if (!userDoc.exists) {
      return null;
    }

    return {
      uid: userDoc.id,
      ...userDoc.data(),
    } as UserProfile;
  } catch (error) {
    console.error('Error in getUserByUid:', error);
    throw new Error(`Failed to get user: ${(error as Error).message}`);
  }
}

/**
 * Get user by email
 */
async function getUserByEmail(email: string): Promise<UserProfile | null> {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      uid: doc.id,
      ...doc.data(),
    } as UserProfile;
  } catch (error) {
    console.error('Error in getUserByEmail:', error);
    throw new Error(`Failed to get user by email: ${(error as Error).message}`);
  }
}

/**
 * Update user profile
 */
async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<UserProfile> {
  try {
    const db = getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(uid);

    // Add updatedAt timestamp
    const updateData = {
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await userRef.update(updateData);

    const updatedDoc = await userRef.get();

    console.log(`✅ User profile updated: ${uid}`);

    return {
      uid: updatedDoc.id,
      ...updatedDoc.data(),
    } as UserProfile;
  } catch (error) {
    console.error('Error in updateUserProfile:', error);
    throw new Error(`Failed to update user profile: ${(error as Error).message}`);
  }
}

/**
 * Check if email already exists
 */
async function emailExists(email: string): Promise<boolean> {
  try {
    const user = await getUserByEmail(email);
    return user !== null;
  } catch (error) {
    console.error('Error in emailExists:', error);
    return false;
  }
}

/**
 * Get all users (admin only, with pagination)
 */
async function getAllUsers(
  limit: number = 50,
  lastDocId: string | null = null
): Promise<PaginatedResponse<UserProfile>> {
  try {
    const db = getFirestore();
    let query = db.collection(USERS_COLLECTION).orderBy('createdAt', 'desc').limit(limit);

    if (lastDocId) {
      const lastDoc = await db.collection(USERS_COLLECTION).doc(lastDocId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();

    const users: UserProfile[] = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
    } as UserProfile));

    return {
      items: users,
      total: users.length,
      page: 1,
      limit,
      hasMore: snapshot.docs.length === limit,
      lastDocId: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null,
    };
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    throw new Error(`Failed to get users: ${(error as Error).message}`);
  }
}

/**
 * Update user personal identity details and identity proof in Firestore
 */
async function updateUserIdentityDetails(
  uid: string,
  details: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    phone: string;
    identityProof: IdentityProof;
  }
): Promise<UserProfile> {
  try {
    const db = getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const timestamp = FieldValue.serverTimestamp();

    const middle = details.middleName ? ` ${details.middleName}` : '';
    const fullName = `${details.firstName}${middle} ${details.lastName}`.trim();

    const updates = {
      firstName: details.firstName,
      middleName: details.middleName || null,
      lastName: details.lastName,
      displayName: fullName,
      phone: details.phone,
      identityProof: details.identityProof,
      govtIdUploaded: true,
      profileComplete: true,
      updatedAt: timestamp,
    };

    await userRef.set(updates, { merge: true });

    const updatedDoc = await userRef.get();
    console.log(`✅ User identity details & ID proof updated in Firestore: ${uid}`);

    return {
      uid: updatedDoc.id,
      ...updatedDoc.data(),
    } as UserProfile;
  } catch (error) {
    console.error('Error in updateUserIdentityDetails:', error);
    throw new Error(`Failed to update identity details: ${(error as Error).message}`);
  }
}

/**
 * Save facial biometric embedding and metadata into Cloud Firestore
 * Stores encrypted vector in 'biometrics/{userId}' and updates 'users/{userId}' status
 */
async function saveBiometricRecord(record: {
  userId: string;
  encryptedEmbedding: string;
  modelName?: string;
  detectorBackend?: string;
  embeddingDimensions?: number;
  facesProcessed?: number;
}): Promise<BiometricRecord> {
  try {
    const db = getFirestore();
    const bioRef = db.collection(BIOMETRICS_COLLECTION).doc(record.userId);
    const userRef = db.collection(USERS_COLLECTION).doc(record.userId);
    const timestamp = FieldValue.serverTimestamp();

    const biometricData = {
      userId: record.userId,
      encryptedEmbedding: record.encryptedEmbedding,
      modelName: record.modelName || 'VGG-Face',
      detectorBackend: record.detectorBackend || 'opencv',
      embeddingDimensions: record.embeddingDimensions || 4096,
      facesProcessed: record.facesProcessed || 1,
      status: 'active',
      version: 1,
      enrolledAt: timestamp,
      updatedAt: timestamp,
    };

    // Save encrypted embedding in biometrics collection
    await bioRef.set(biometricData, { merge: true });

    // Update user profile with biometric enrollment indicators
    await userRef.set(
      {
        biometricEnrolled: true,
        biometricEnrolledAt: timestamp,
        biometricModel: record.modelName || 'VGG-Face',
        biometricDimensions: record.embeddingDimensions || 4096,
        updatedAt: timestamp,
      },
      { merge: true }
    );

    console.log(`✅ Biometric vector & metadata saved to Cloud Firestore for: ${record.userId}`);

    return {
      ...biometricData,
      status: 'active',
      enrolledAt: new Date(),
      updatedAt: new Date(),
    } as BiometricRecord;
  } catch (error) {
    console.error('Error in saveBiometricRecord:', error);
    throw new Error(`Failed to save biometric record: ${(error as Error).message}`);
  }
}

/**
 * Get facial biometric record from Cloud Firestore (for verification or gate sync)
 */
async function getBiometricRecord(userId: string): Promise<BiometricRecord | null> {
  try {
    const db = getFirestore();
    const bioDoc = await db.collection(BIOMETRICS_COLLECTION).doc(userId).get();

    if (!bioDoc.exists) {
      return null;
    }

    return bioDoc.data() as BiometricRecord;
  } catch (error) {
    console.error('Error in getBiometricRecord:', error);
    throw new Error(`Failed to get biometric record: ${(error as Error).message}`);
  }
}

export {
  createOrUpdateUser,
  getUserByUid,
  getUserByEmail,
  updateUserProfile,
  updateUserIdentityDetails,
  saveBiometricRecord,
  getBiometricRecord,
  emailExists,
  getAllUsers,
};
