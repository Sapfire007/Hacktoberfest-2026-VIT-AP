/**
 * Seed the three demo staff accounts - admin, security and faculty.
 *
 * The staff sign-in screen now has one tab per institutional role, and each tab needs a
 * working account behind it before the features that hang off those roles can be built or
 * demonstrated. Provisioning three accounts by hand through the admin console every time
 * a Firebase project is reset is friction that gets skipped, and a tab with no account
 * behind it looks like a bug rather than a missing seed.
 *
 * These are development fixtures, not a production convenience. Two guards keep them from
 * becoming one:
 *
 *   1. The script refuses to run when NODE_ENV is 'production'.
 *   2. The passwords are visible in this file and in the app's dev-only prefill, so
 *      nobody can mistake them for secrets.
 *
 * `mustChangePassword` is cleared, unlike a real provisioning - the whole point is that
 * the credential works immediately and identically on every machine.
 *
 * Usage:
 *   npm run seed:demo-staff            create or repair the three accounts
 *   npm run seed:demo-staff -- --force reset the passwords of existing ones
 */

import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { FieldValue } from 'firebase-admin/firestore';
import { initializeFirebase, getFirestore } from '../config/firebase.admin';
import { provisionStaff, normalizeEmployeeId, setRoleClaim } from '../services/staff.service';
import { StaffRole } from '../types';

dotenv.config();

const STAFF_COLLECTION = process.env.FIRESTORE_COLLECTION_STAFF || 'staff_credentials';

/**
 * The fixtures. Employee IDs follow the VITAP<digits> shape used on real cards so the
 * input's uppercase-as-you-type behaviour is exercised the same way in testing as in use.
 *
 * Keep these in sync with DEMO_STAFF_CREDENTIALS in the app's
 * `src/constants/demoCredentials.ts` - that file is what prefills the sign-in tabs.
 */
export const DEMO_STAFF: {
  employeeId: string;
  password: string;
  role: StaffRole;
  displayName: string;
  department: string;
}[] = [
  {
    employeeId: 'VITAP-ADM01',
    password: 'VisionAdmin@2026',
    role: 'admin',
    displayName: 'Demo Administrator',
    department: 'Campus IT',
  },
  {
    employeeId: 'VITAP-SEC01',
    password: 'VisionSecurity@2026',
    role: 'security',
    displayName: 'Demo Gate Officer',
    department: 'Security - Main Gate',
  },
  {
    employeeId: 'VITAP-FAC01',
    password: 'VisionFaculty@2026',
    role: 'faculty',
    displayName: 'Demo Faculty Mentor',
    department: 'School of Computer Science',
  },
];

const BCRYPT_ROUNDS = 12;

/**
 * Reset an existing fixture in place.
 *
 * `provisionStaff` refuses an employee ID it has already seen, which is correct for real
 * provisioning - a deactivated ID must never be reissued to a different person. A demo
 * fixture is the same person every time, so re-seeding repairs the record rather than
 * creating a second one.
 */
async function repairExisting(
  employeeId: string,
  password: string,
  uid: string,
  role: StaffRole
): Promise<void> {
  const db = getFirestore();

  await db.collection(STAFF_COLLECTION).doc(normalizeEmployeeId(employeeId)).update({
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    active: true,
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Claims are refreshed too: a Firebase project restored from a partial backup can have
  // the credential document without the matching custom claim, which signs in fine and
  // then fails every authorization check with no obvious cause.
  await setRoleClaim(uid, role, normalizeEmployeeId(employeeId));
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Refusing to seed demo staff accounts in production.\n' +
        'These credentials are published in the repository and in the app bundle.'
    );
    process.exit(1);
  }

  const force = process.argv.includes('--force');

  initializeFirebase();

  const db = getFirestore();

  for (const fixture of DEMO_STAFF) {
    const id = normalizeEmployeeId(fixture.employeeId);
    const existing = await db.collection(STAFF_COLLECTION).doc(id).get();

    if (existing.exists) {
      if (!force) {
        console.log(`  = ${id.padEnd(14)} already exists (pass --force to reset its password)`);
        continue;
      }

      await repairExisting(id, fixture.password, existing.data()!.uid, fixture.role);
      console.log(`  ~ ${id.padEnd(14)} password reset  [${fixture.role}]`);
      continue;
    }

    const credential = await provisionStaff({
      employeeId: id,
      password: fixture.password,
      role: fixture.role,
      displayName: fixture.displayName,
      department: fixture.department,
      provisionedByUid: 'seed-demo',
    });

    // Provisioning always sets mustChangePassword, because a real admin has just read the
    // password aloud to someone. Nobody read these aloud.
    await db.collection(STAFF_COLLECTION).doc(id).update({ mustChangePassword: false });

    console.log(`  + ${id.padEnd(14)} created         [${credential.role}]`);
  }

  console.log('\nDemo staff credentials:\n');
  for (const fixture of DEMO_STAFF) {
    console.log(
      `  ${fixture.role.padEnd(9)}  ${normalizeEmployeeId(fixture.employeeId).padEnd(14)}  ${fixture.password}`
    );
  }
  console.log('\nThese are development fixtures. Do not seed them into a real deployment.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Demo staff seed failed:', (error as Error).message);
    process.exit(1);
  });
