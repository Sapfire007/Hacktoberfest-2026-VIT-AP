/**
 * Reset a faculty directory member's password.
 *
 * The admin console resets staff_credentials accounts only; faculty imported into the
 * `faculty` collection have no button. This is the way to rotate one - in particular a
 * password that has been exposed (VISION.md §10).
 *
 * It sets a random temporary password, prints it once, and flags the account so the app
 * sends the holder to Change password at their next sign-in. Their current sessions are
 * ended, so the old password and any session obtained with it stop working now.
 *
 * Usage:
 *   npm run reset:faculty-password -- --username <username>
 */

import crypto from 'crypto';
import * as dotenv from 'dotenv';
import argon2 from 'argon2';
import { FieldValue } from 'firebase-admin/firestore';
import { initializeFirebase, getFirestore, getAuth } from '../config/firebase.admin';

dotenv.config();

const FACULTY_COLLECTION = process.env.FIRESTORE_COLLECTION_FACULTY || 'faculty';

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const username = getArg('username')?.trim().toLowerCase();
  if (!username || username.includes('/')) {
    console.error('Usage: npm run reset:faculty-password -- --username <username>');
    process.exit(1);
  }

  initializeFirebase();
  const db = getFirestore();

  let ref = db.collection(FACULTY_COLLECTION).doc(username);
  let snap = await ref.get();
  if (!snap.exists) {
    const byUsername = await db.collection(FACULTY_COLLECTION).where('username', '==', username).limit(1).get();
    if (byUsername.empty) {
      console.error(`No faculty record for "${username}".`);
      process.exit(1);
    }
    ref = byUsername.docs[0].ref;
    snap = byUsername.docs[0];
  }

  // 12 characters from a 64-symbol alphabet: 72 bits, typed once by a person.
  const temporary = crypto.randomBytes(9).toString('base64url');

  await ref.update({
    // The same parameters the directory was imported with.
    passwordHash: await argon2.hash(temporary, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    }),
    mustChangePassword: true,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const uid = snap.data()?.uid as string | undefined;
  if (uid) {
    try {
      await getAuth().revokeRefreshTokens(uid);
    } catch (error) {
      console.warn(`Could not end existing sessions for ${uid}: ${(error as Error).message}`);
    }
  }

  console.log(`\nPassword reset for ${snap.id}.`);
  console.log(`  Temporary password : ${temporary}`);
  console.log('\nHand it over in person. They must choose a new one at their next sign-in.');
  console.log(uid ? 'Their existing sessions have been ended.\n' : 'They have never signed in.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Reset failed:', (error as Error).message);
    process.exit(1);
  });
