/**
 * Report staff and faculty accounts that can be signed into without the employee ID.
 *
 * Read-only. Until 2026-10, provisioning a staff account - and a faculty member's first
 * sign-in - reused any existing Firebase user with a matching email. Self-signup accepts
 * any address unverified, so someone could have registered a staff member's address first
 * and received that staff member's role on their own account. That path is closed; this
 * script looks for any account it may already have produced.
 *
 * A flagged row is a staff or faculty uid whose Firebase user also has a password or
 * Google sign-in, or that also owns a visitor/parent/student profile. Staff never sign in
 * either way, so each one is either a person who once registered with their own address
 * (merged, harmless but untidy) or a takeover. Check with the person.
 *
 * Usage:
 *   npm run audit:accounts
 */

import * as dotenv from 'dotenv';
import { initializeFirebase, getFirestore, getAuth } from '../config/firebase.admin';

dotenv.config();

const STAFF_COLLECTION = process.env.FIRESTORE_COLLECTION_STAFF || 'staff_credentials';
const FACULTY_COLLECTION = process.env.FIRESTORE_COLLECTION_FACULTY || 'faculty';
const USERS_COLLECTION = process.env.FIRESTORE_COLLECTION_USERS || 'users';

interface Linked {
  kind: 'staff' | 'faculty';
  id: string;
  uid: string;
}

async function main(): Promise<void> {
  initializeFirebase();
  const db = getFirestore();

  const linked: Linked[] = [];
  for (const doc of (await db.collection(STAFF_COLLECTION).get()).docs) {
    if (doc.data().uid) linked.push({ kind: 'staff', id: doc.id, uid: doc.data().uid });
  }
  for (const doc of (await db.collection(FACULTY_COLLECTION).where('uid', '!=', null).get()).docs) {
    if (doc.data().uid) linked.push({ kind: 'faculty', id: doc.id, uid: doc.data().uid });
  }

  const flagged: string[] = [];
  for (let i = 0; i < linked.length; i += 100) {
    const batch = linked.slice(i, i + 100);
    const result = await getAuth().getUsers(batch.map((l) => ({ uid: l.uid })));
    const byUid = new Map(result.users.map((u) => [u.uid, u]));

    for (const account of batch) {
      const user = byUid.get(account.uid);
      if (!user) continue;
      const providers = user.providerData.map((p) => p.providerId);
      const profile = await db.collection(USERS_COLLECTION).doc(account.uid).get();

      const reasons: string[] = [];
      if (providers.length > 0) reasons.push(`can also sign in with: ${providers.join(', ')}`);
      if (profile.exists) reasons.push(`also has a ${profile.data()?.role || 'requester'} profile`);
      if (reasons.length === 0) continue;

      flagged.push(
        `  ${account.kind.padEnd(8)} ${account.id.padEnd(24)} uid ${account.uid}\n` +
          `           ${reasons.join('; ')}${user.email ? ` (email ${user.email})` : ''}\n` +
          (account.kind === 'faculty'
            ? '           fix: clear `uid` on the faculty record; their next sign-in creates a clean account\n'
            : '           fix: deactivate this employee ID and provision a new one\n')
      );
    }
  }

  console.log(`\nChecked ${linked.length} staff and faculty accounts.`);
  if (flagged.length === 0) {
    console.log('None can be signed into except with the employee ID and password.\n');
    return;
  }
  console.log(`${flagged.length} need a look:\n`);
  console.log(flagged.join('\n'));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Audit failed:', (error as Error).message);
    process.exit(1);
  });
