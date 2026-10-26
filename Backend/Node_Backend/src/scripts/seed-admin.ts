/**
 * Seed the first admin account.
 *
 * Staff accounts are provisioned by an admin, which leaves an obvious chicken-and-egg
 * problem for the very first one. This script is the single bootstrap exception, and it
 * is deliberately a one-off command rather than an endpoint — an endpoint that creates an
 * admin, however well guarded, is a permanent hole in the provisioning model.
 *
 * Usage:
 *   npm run seed:admin -- --employee-id ADMIN001 --name "Campus IT" --password "<password>"
 *
 * It refuses to run once any active admin exists, so it cannot be used later to mint a
 * second one behind the console's back.
 */

import * as dotenv from 'dotenv';
import { initializeFirebase } from '../config/firebase.admin';
import { provisionStaff, countActiveAdmins } from '../services/staff.service';

dotenv.config();

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const employeeId = getArg('employee-id');
  const displayName = getArg('name');
  const password = getArg('password');
  const email = getArg('email');
  const department = getArg('department');

  if (!employeeId || !displayName || !password) {
    console.error(
      'Usage: npm run seed:admin -- --employee-id <id> --name "<name>" --password "<password>" [--email <email>] [--department <dept>]'
    );
    process.exit(1);
  }

  if (password.length < 12) {
    // Stricter than the 8-character API minimum. This account can provision every other
    // account in the system, and it is typed once by a person who is not in a hurry.
    console.error('The seed admin password must be at least 12 characters.');
    process.exit(1);
  }

  initializeFirebase();

  const existingAdmins = await countActiveAdmins();
  if (existingAdmins > 0) {
    console.error(
      `Refusing to seed: ${existingAdmins} active admin account(s) already exist.\n` +
        'Create further admins through the console (POST /api/admin/staff).'
    );
    process.exit(1);
  }

  const credential = await provisionStaff({
    employeeId,
    password,
    role: 'admin',
    displayName,
    department,
    email,
    // No provisioning admin exists yet, by definition. Recorded as 'seed' so the audit
    // trail says where this account came from rather than leaving the field empty.
    provisionedByUid: 'seed',
  });

  console.log('\nSeed admin created.');
  console.log(`  Employee ID : ${credential.employeeId}`);
  console.log(`  Name        : ${credential.displayName}`);
  console.log(`  Role        : ${credential.role}`);
  console.log('\nSign in with this employee ID and the password you supplied.');
  console.log('You will be asked to change it immediately.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', (error as Error).message);
    process.exit(1);
  });
