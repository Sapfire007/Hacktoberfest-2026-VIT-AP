/**
 * Fix Faculty UID Links Script
 * 
 * This script ensures all faculty documents have their `uid` field populated.
 * Run this to fix the issue where faculty inbox shows empty because the uid link is missing.
 * 
 * Usage: npx ts-node src/scripts/fix-faculty-uid-links.ts
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert } from 'firebase-admin/app';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const FACULTY_COLLECTION = 'faculty';

interface FacultyDocument {
  uid?: string;
  username?: string;
  name?: string;
  email?: string;
  status?: string;
}

async function ensureServerOwnedUser(identifier: string, displayName: string): Promise<string> {
  const auth = getAuth();
  const email = `${identifier}@vision.internal`;

  try {
    const existing = await auth.getUserByEmail(email);
    return existing.uid;
  } catch {
    const created = await auth.createUser({
      email,
      emailVerified: true,
      displayName,
      password: Math.random().toString(36) + Math.random().toString(36),
    });
    return created.uid;
  }
}

async function fixFacultyUidLinks() {
  console.log('🔧 Starting faculty UID link fix...\n');

  // Initialize Firebase Admin
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS not set in .env');
    process.exit(1);
  }

  try {
    const serviceAccount = require(path.resolve(serviceAccountPath));
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log('✅ Firebase Admin initialized\n');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error);
    process.exit(1);
  }

  const db = getFirestore();
  const auth = getAuth();
  const facultyRef = db.collection(FACULTY_COLLECTION);

  // Get all faculty documents
  const snapshot = await facultyRef.get();
  console.log(`📊 Found ${snapshot.size} faculty documents\n`);

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    const docId = doc.id;
    const data = doc.data() as FacultyDocument;
    const name = data.name || data.username || docId;

    console.log(`\n👤 Processing: ${name} (${docId})`);

    // Check if uid already exists and is valid
    if (data.uid) {
      try {
        await auth.getUser(data.uid);
        console.log(`  ✅ UID already set and valid: ${data.uid}`);
        skipped++;
        continue;
      } catch {
        console.log(`  ⚠️  UID exists but invalid in Auth: ${data.uid}, will re-link`);
      }
    } else {
      console.log(`  ⚠️  No UID field found`);
    }

    // Create or get auth user and link it
    try {
      const identifier = `faculty_${data.username || docId}`;
      const uid = await ensureServerOwnedUser(identifier, name);
      
      await facultyRef.doc(docId).set({ uid }, { merge: true });
      
      console.log(`  ✅ Fixed! Linked to UID: ${uid}`);
      fixed++;
    } catch (error) {
      console.error(`  ❌ Error fixing ${docId}:`, error);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`  ✅ Fixed: ${fixed}`);
  console.log(`  ⏭️  Skipped (already valid): ${skipped}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log(`  📝 Total: ${snapshot.size}`);
  console.log('='.repeat(60));

  if (fixed > 0) {
    console.log('\n✨ Faculty records have been updated!');
    console.log('💡 Faculty members should now be able to see their inbox.');
    console.log('💡 If they already logged in before, they should see requests immediately.');
    console.log('💡 If they haven\'t logged in yet, they need to log in once for the fix to apply.');
  }

  process.exit(0);
}

// Run the script
fixFacultyUidLinks().catch((error) => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});
