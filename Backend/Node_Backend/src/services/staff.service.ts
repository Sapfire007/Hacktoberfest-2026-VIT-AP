/**
 * Staff Credential Service
 *
 * Implements the employee-ID authentication track for Faculty, Security and Admin.
 *
 * Why a custom token rather than a synthetic email address:
 * Firebase Authentication has no native "sign in with an employee ID". The alternative
 * is to fabricate an address such as EMP1234@staff.vision.local and use the normal
 * email/password flow — but that leaks a fake domain into the identity record, makes
 * password reset incoherent, and couples the employee ID format to an email grammar.
 * Instead this service verifies the credential itself and mints a Firebase custom token,
 * which the app exchanges for an ordinary session. Every authentication path in the
 * system therefore ends in one token type and one verification routine.
 * See VISION.md ADR-003.
 *
 * The password hash never leaves this module. No function here returns it, and callers
 * receive only the credential's public fields.
 */

import bcrypt from 'bcryptjs';
import argon2 from 'argon2';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirestore, getAuth } from '../config/firebase.admin';
import { StaffCredential, StaffRole, UserRole } from '../types';

const STAFF_COLLECTION = process.env.FIRESTORE_COLLECTION_STAFF || 'staff_credentials';
const FACULTY_COLLECTION = process.env.FIRESTORE_COLLECTION_FACULTY || 'faculty';

/**
 * Work factor for bcrypt. 12 is a deliberate middle ground: high enough that an offline
 * attack on a leaked hash is expensive, low enough that a gate officer's sign-in at the
 * start of a shift does not visibly stall.
 */
const BCRYPT_ROUNDS = 12;

/** Failed attempts tolerated before the account locks. */
const MAX_FAILED_ATTEMPTS = 5;

/** How long the account stays locked once the limit is hit. */
const LOCKOUT_MINUTES = 15;

/** Compared against when there is no real hash, so every failure costs the same time. */
const DUMMY_HASH = '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';

/** Result of a sign-in attempt. The caller maps this to a response. */
export type StaffLoginResult =
  | { ok: true; credential: PublicStaffCredential; customToken: string }
  | { ok: false; reason: 'invalid'; }
  | { ok: false; reason: 'locked'; retryAfterSeconds: number }
  | { ok: false; reason: 'deactivated' };

/** A credential record with the hash and lockout internals stripped off. */
export interface PublicStaffCredential {
  employeeId: string;
  uid: string;
  role: StaffRole;
  displayName: string;
  department: string | null;
  email: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}

/**
 * Employee IDs are printed on physical cards in a fixed case and people type them
 * inconsistently, so they are normalised on every read and write. Normalising at the
 * boundary means the stored id and the looked-up id can never disagree over whitespace
 * or case.
 */
function normalizeEmployeeId(employeeId: string): string {
  return employeeId.trim().toUpperCase();
}

function toPublic(credential: StaffCredential): PublicStaffCredential {
  return {
    employeeId: credential.employeeId,
    uid: credential.uid,
    role: credential.role,
    displayName: credential.displayName,
    department: credential.department ?? null,
    email: credential.email ?? null,
    active: credential.active,
    mustChangePassword: credential.mustChangePassword,
    lastLoginAt: toDate(credential.lastLoginAt),
  };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
}

async function getCredential(employeeId: string): Promise<StaffCredential | null> {
  const db = getFirestore();
  const doc = await db.collection(STAFF_COLLECTION).doc(normalizeEmployeeId(employeeId)).get();
  return doc.exists ? (doc.data() as StaffCredential) : null;
}

/**
 * Write the role (and employee ID, where there is one) into the account's Firebase custom
 * claims. This is the only place a role becomes authoritative — everything downstream
 * reads it back out of a verified token.
 */
async function setRoleClaim(uid: string, role: UserRole, employeeId?: string): Promise<void> {
  const claims: Record<string, unknown> = { role };
  if (employeeId) claims.employeeId = employeeId;
  await getAuth().setCustomUserClaims(uid, claims);
}

interface FacultyDocument {
  id?: number;
  employeeId?: string;
  name?: string;
  email?: string;
  department?: string;
  username?: string;
  passwordHash?: string;
  role?: string;
  status?: string;
  uid?: string;
  failedAttempts?: number;
  lockedUntil?: unknown;
  lastLoginAt?: unknown;
  mustChangePassword?: boolean;
}

async function getFacultyCredential(
  identifier: string
): Promise<{ docId: string; data: FacultyDocument } | null> {
  const db = getFirestore();
  const raw = identifier.trim();
  const lower = raw.toLowerCase();

  // 1. Direct doc lookup by lowercase username (how migrate-faculty-to-firestore stored them)
  const docRef = db.collection(FACULTY_COLLECTION).doc(lower);
  const directDoc = await docRef.get();
  if (directDoc.exists) {
    return { docId: directDoc.id, data: directDoc.data() as FacultyDocument };
  }

  // 2. Query by username
  const byUsername = await db.collection(FACULTY_COLLECTION).where('username', '==', lower).limit(1).get();
  if (!byUsername.empty) {
    const doc = byUsername.docs[0];
    return { docId: doc.id, data: doc.data() as FacultyDocument };
  }

  // 3. Query by employeeId
  const byEmpId = await db.collection(FACULTY_COLLECTION).where('employeeId', '==', raw).limit(1).get();
  if (!byEmpId.empty) {
    const doc = byEmpId.docs[0];
    return { docId: doc.id, data: doc.data() as FacultyDocument };
  }

  // 4. Query by email
  const byEmail = await db.collection(FACULTY_COLLECTION).where('email', '==', lower).limit(1).get();
  if (!byEmail.empty) {
    const doc = byEmail.docs[0];
    return { docId: doc.id, data: doc.data() as FacultyDocument };
  }

  return null;
}

async function verifyPasswordHash(storedHash: string, candidate: string): Promise<boolean> {
  if (storedHash.startsWith('$argon2')) {
    return argon2.verify(storedHash, candidate);
  }
  return bcrypt.compare(candidate, storedHash);
}

/**
 * Create (or reuse) a Firebase user under a uid only this server can mint.
 *
 * The user is never found by email, and never given one. An existing account with a
 * matching address could belong to anyone: self-signup accepts any address, unverified, so
 * an attacker could register a faculty member's published email - or `vitap-adm02@...` -
 * and wait for the real account to be provisioned onto their account, role claim and all.
 * A uid in the `staff_` / `faculty_` namespace cannot be chosen by a client, so one that
 * already exists is a leftover of our own earlier attempt and safe to reuse. The address
 * lives in the staff or faculty record, where everything that needs it reads it.
 */
async function ensureServerOwnedUser(uid: string, displayName: string): Promise<string> {
  try {
    const created = await getAuth().createUser({ uid, displayName });
    return created.uid;
  } catch (err: any) {
    if (err?.code !== 'auth/uid-already-exists') throw err;
    return uid;
  }
}

async function ensureFacultyAuthUser(data: FacultyDocument, docId: string): Promise<string> {
  const auth = getAuth();
  const db = getFirestore();

  if (data.uid) {
    try {
      const existing = await auth.getUser(data.uid);
      return existing.uid;
    } catch {
      // Stale or missing in Auth, continue to re-link or recreate
    }
  }

  const uid = await ensureServerOwnedUser(
    `faculty_${data.username || docId}`,
    data.name || data.username || docId
  );
  await db.collection(FACULTY_COLLECTION).doc(docId).set({ uid }, { merge: true });
  return uid;
}

async function recordFacultyFailedAttempt(docId: string, currentAttempts: number): Promise<void> {
  const db = getFirestore();
  const attempts = currentAttempts + 1;
  const update: Record<string, unknown> = {
    failedAttempts: attempts,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    update.lockedUntil = Timestamp.fromMillis(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    update.failedAttempts = 0;
  }

  await db.collection(FACULTY_COLLECTION).doc(docId).update(update);
}

async function clearFacultyFailedAttempts(docId: string): Promise<void> {
  const db = getFirestore();
  await db.collection(FACULTY_COLLECTION).doc(docId).update({
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Verify an employee ID and password, and on success mint a custom token.
 *
 * Supports staff credentials (Admin, Security, Demo) as well as the migrated
 * institutional faculty collection (authenticated via Argon2id).
 *
 * The failure cases are deliberately asymmetric. An unknown employee ID and a wrong
 * password both return `invalid`, so a caller cannot use this endpoint to discover which
 * IDs exist. A deactivated account is told plainly, because that is not a guessing attack
 * and leaving the person to retry a correct password wastes their time.
 */
async function authenticateStaff(
  employeeId: string,
  password: string
): Promise<StaffLoginResult> {
  const id = normalizeEmployeeId(employeeId);

  // Not a possible ID (and not a valid Firestore document id): answer exactly like an
  // unknown one, including the time a hash takes.
  if (!id || id.length > 128 || id.includes('/')) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: 'invalid' };
  }

  const credential = await getCredential(id);

  if (credential) {
    const lockedUntil = toDate(credential.lockedUntil);
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      return {
        ok: false,
        reason: 'locked',
        retryAfterSeconds: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
      };
    }

    const passwordMatches = await bcrypt.compare(password, credential.passwordHash);

    if (!passwordMatches) {
      await recordFailedAttempt(id, credential.failedAttempts ?? 0);
      return { ok: false, reason: 'invalid' };
    }

    // Deactivation is checked only after the password matches, so a probe with a wrong
    // password cannot learn that an employee ID exists but is disabled.
    if (!credential.active) {
      return { ok: false, reason: 'deactivated' };
    }

    // The demo fixtures' passwords are published in the repository and the app bundle.
    // Whatever database they end up in, they must never open a production deployment.
    if (process.env.NODE_ENV === 'production' && credential.provisionedByUid === 'seed-demo') {
      console.warn(`Refused sign-in to demo account ${id}: NODE_ENV is production`);
      return { ok: false, reason: 'deactivated' };
    }

    await clearFailedAttempts(id);

    // Refresh the claims on every sign-in. If an admin changed this account's role, the
    // change takes effect at the next sign-in rather than whenever the old token expires.
    await setRoleClaim(credential.uid, credential.role, id);

    const customToken = await getAuth().createCustomToken(credential.uid, {
      role: credential.role,
      employeeId: id,
    });

    return { ok: true, credential: toPublic(credential), customToken };
  }

  // Not in staff_credentials — check the institutional faculty collection
  const faculty = await getFacultyCredential(employeeId);
  if (!faculty) {
    // Hash anyway so an unknown ID costs the same time as a wrong password. Without this,
    // response timing alone reveals which IDs are real.
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: 'invalid' };
  }

  const { docId, data } = faculty;

  const lockedUntil = toDate(data.lockedUntil);
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return {
      ok: false,
      reason: 'locked',
      retryAfterSeconds: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
    };
  }

  if (!data.passwordHash) {
    return { ok: false, reason: 'invalid' };
  }

  const passwordMatches = await verifyPasswordHash(data.passwordHash, password);

  if (!passwordMatches) {
    await recordFacultyFailedAttempt(docId, data.failedAttempts ?? 0);
    return { ok: false, reason: 'invalid' };
  }

  if (data.status && data.status !== 'active') {
    return { ok: false, reason: 'deactivated' };
  }

  await clearFacultyFailedAttempts(docId);

  const uid = await ensureFacultyAuthUser(data, docId);
  const staffEmployeeId = data.username || docId;

  await setRoleClaim(uid, 'faculty', staffEmployeeId);

  const customToken = await getAuth().createCustomToken(uid, {
    role: 'faculty',
    employeeId: staffEmployeeId,
  });

  const publicCredential: PublicStaffCredential = {
    employeeId: staffEmployeeId,
    uid,
    role: 'faculty',
    displayName: data.name || staffEmployeeId,
    department: data.department ?? null,
    email: data.email ?? null,
    active: true,
    // Set by reset-faculty-password; the app sends the holder to Change password.
    mustChangePassword: Boolean(data.mustChangePassword),
    lastLoginAt: new Date(),
  };

  await getFirestore().collection(FACULTY_COLLECTION).doc(docId).update({
    lastLoginAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, credential: publicCredential, customToken };
}

async function recordFailedAttempt(employeeId: string, currentAttempts: number): Promise<void> {
  const db = getFirestore();
  const attempts = currentAttempts + 1;

  const update: Record<string, unknown> = {
    failedAttempts: attempts,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    update.lockedUntil = Timestamp.fromMillis(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    update.failedAttempts = 0;
  }

  await db.collection(STAFF_COLLECTION).doc(employeeId).update(update);
}

async function clearFailedAttempts(employeeId: string): Promise<void> {
  const db = getFirestore();
  await db.collection(STAFF_COLLECTION).doc(employeeId).update({
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Provision a new staff account. The only way a Faculty, Security or Admin account comes
 * into existence — see PRD.md FR-ADM-06.
 *
 * A deactivated employee ID is never reissued (FR-ADM-08), so this refuses any ID already
 * present, active or not.
 */
async function provisionStaff(params: {
  employeeId: string;
  password: string;
  role: StaffRole;
  displayName: string;
  department?: string;
  email?: string;
  provisionedByUid: string;
}): Promise<PublicStaffCredential> {
  const db = getFirestore();
  const id = normalizeEmployeeId(params.employeeId);

  const existing = await getCredential(id);
  if (existing) {
    throw new Error(`Employee ID ${id} is already in use`);
  }

  // Every staff member also needs a Firebase user, because the app signs in with a real
  // session. It has no password and no email: staff authenticate only through this
  // collection, and an email on the Firebase user would open Google sign-in and password
  // reset as other ways in. See ensureServerOwnedUser for why it is never adopted by email.
  const uid = await ensureServerOwnedUser(`staff_${id}`, params.displayName);

  const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
  const timestamp = FieldValue.serverTimestamp();

  const credential: StaffCredential = {
    employeeId: id,
    uid,
    passwordHash,
    role: params.role,
    displayName: params.displayName,
    department: params.department ?? null,
    email: params.email ?? null,
    active: true,
    // The provisioning admin chose this password and has to hand it over, so it must be
    // replaced by one only the account holder knows.
    mustChangePassword: true,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    provisionedByUid: params.provisionedByUid,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(STAFF_COLLECTION).doc(id).set(credential);
  await setRoleClaim(uid, params.role, id);

  return toPublic(credential);
}

/**
 * Change one's own password. Requires the current password, so a stolen unlocked device
 * cannot be used to lock the real owner out.
 */
async function changeStaffPassword(
  employeeId: string,
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const id = normalizeEmployeeId(employeeId);
  const credential = await getCredential(id);
  if (credential) {
    const matches = await bcrypt.compare(currentPassword, credential.passwordHash);
    if (!matches) return false;

    const db = getFirestore();
    await db.collection(STAFF_COLLECTION).doc(id).update({
      passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return true;
  }

  // Check the institutional faculty collection
  const faculty = await getFacultyCredential(employeeId);
  if (!faculty || !faculty.data.passwordHash) return false;

  const matches = await verifyPasswordHash(faculty.data.passwordHash, currentPassword);
  if (!matches) return false;

  const newHash = await argon2.hash(newPassword);
  const db = getFirestore();
  await db.collection(FACULTY_COLLECTION).doc(faculty.docId).update({
    passwordHash: newHash,
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return true;
}

/**
 * Admin-initiated password reset. Staff have no self-service recovery: an employee ID is
 * not an email address, and there is nowhere to send a link. The admin hands the new
 * password over directly, and the holder must change it on next sign-in.
 */
async function resetStaffPassword(employeeId: string, newPassword: string): Promise<boolean> {
  const id = normalizeEmployeeId(employeeId);
  const credential = await getCredential(id);
  if (!credential) return false;

  const db = getFirestore();
  await db.collection(STAFF_COLLECTION).doc(id).update({
    passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
    mustChangePassword: true,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return true;
}

/**
 * Deactivate or reactivate a staff account.
 *
 * Deactivating revokes refresh tokens as well as flipping the flag, so access ends now
 * rather than whenever the current token happens to expire (PRD.md FR-ADM-07). The record
 * itself is kept: it stops the employee ID being reissued, and it keeps historic audit
 * entries resolvable to a real person.
 */
async function setStaffActive(employeeId: string, active: boolean): Promise<boolean> {
  const id = normalizeEmployeeId(employeeId);
  const credential = await getCredential(id);
  if (!credential) return false;

  if (!active && credential.role === 'admin') {
    const remainingAdmins = await countActiveAdmins();
    if (remainingAdmins <= 1) {
      // Otherwise the console locks everyone out with no way back short of the seed script.
      throw new Error('Cannot deactivate the last remaining active admin account');
    }
  }

  const db = getFirestore();
  await db.collection(STAFF_COLLECTION).doc(id).update({
    active,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Disabling the Firebase user as well means a deactivated account cannot get a session
  // by any route - not Google sign-in, not an email reset - the same way a suspended
  // requester is handled.
  try {
    if (!active) {
      await getAuth().updateUser(credential.uid, { disabled: true });
      await getAuth().revokeRefreshTokens(credential.uid);
      await getAuth().setCustomUserClaims(credential.uid, {});
    } else {
      await getAuth().updateUser(credential.uid, { disabled: false });
      await setRoleClaim(credential.uid, credential.role, id);
    }
  } catch (err: any) {
    // The Firebase user was deleted by hand. The flag above already decides sign-in, and
    // a sign-in would fail anyway with no user to mint a token for.
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  return true;
}

async function countActiveAdmins(): Promise<number> {
  const db = getFirestore();
  const snapshot = await db
    .collection(STAFF_COLLECTION)
    .where('role', '==', 'admin')
    .where('active', '==', true)
    .get();
  return snapshot.size;
}

async function listStaff(role?: StaffRole): Promise<PublicStaffCredential[]> {
  const db = getFirestore();
  let query = db.collection(STAFF_COLLECTION).orderBy('employeeId');
  if (role) {
    query = db.collection(STAFF_COLLECTION).where('role', '==', role).orderBy('employeeId');
  }
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => toPublic(doc.data() as StaffCredential));
}

async function getStaffByUid(uid: string): Promise<PublicStaffCredential | null> {
  const db = getFirestore();
  const snapshot = await db.collection(STAFF_COLLECTION).where('uid', '==', uid).limit(1).get();
  if (!snapshot.empty) {
    return toPublic(snapshot.docs[0].data() as StaffCredential);
  }

  // Check the institutional faculty collection
  const facultySnapshot = await db.collection(FACULTY_COLLECTION).where('uid', '==', uid).limit(1).get();
  if (!facultySnapshot.empty) {
    const doc = facultySnapshot.docs[0];
    const data = doc.data() as FacultyDocument;
    return {
      employeeId: data.username || doc.id,
      uid,
      role: 'faculty',
      displayName: data.name || data.username || 'Faculty Member',
      department: data.department ?? null,
      email: data.email ?? null,
      active: data.status === 'active',
      mustChangePassword: Boolean(data.mustChangePassword),
      lastLoginAt: toDate(data.lastLoginAt),
    };
  }

  return null;
}

export {
  authenticateStaff,
  provisionStaff,
  changeStaffPassword,
  resetStaffPassword,
  setStaffActive,
  listStaff,
  getStaffByUid,
  setRoleClaim,
  normalizeEmployeeId,
  countActiveAdmins,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
};
