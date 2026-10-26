/**
 * Fix UID link for Dr. Sibi Chakkaravarthy S specifically
 */

import { getFirestore } from '../config/firebase.admin';

async function fixDrSibiUid() {
  console.log('🔧 Fixing UID for Dr. Sibi Chakkaravarthy S\n');

  const db = getFirestore();
  
  // Look up Dr. Sibi's faculty document
  const facultyRef = db.collection('faculty').doc('sibi870084');
  const facultyDoc = await facultyRef.get();

  if (!facultyDoc.exists) {
    console.log('❌ Faculty document sibi870084 not found');
    return;
  }

  const facultyData = facultyDoc.data()!;
  console.log('✅ Found faculty:');
  console.log(`   ID: ${facultyDoc.id}`);
  console.log(`   Name: ${facultyData.name}`);
  console.log(`   Email: ${facultyData.email}`);
  console.log(`   Employee ID: ${facultyData.employeeId}`);
  console.log(`   Current UID: ${facultyData.uid || '(not set)'}\n`);

  if (facultyData.uid) {
    console.log('✅ UID already set, no fix needed');
    return;
  }

  // Look up the corresponding auth user by email
  const authQuery = await db.collection('users')
    .where('email', '==', facultyData.email)
    .where('role', '==', 'faculty')
    .limit(1)
    .get();

  if (authQuery.empty) {
    console.log(`❌ No auth user found with email ${facultyData.email} and role faculty`);
    return;
  }

  const authDoc = authQuery.docs[0];
  const authData = authDoc.data();
  const uid = authData.uid || authDoc.id;

  console.log('✅ Found matching auth user:');
  console.log(`   Auth ID: ${authDoc.id}`);
  console.log(`   UID: ${uid}`);
  console.log(`   Email: ${authData.email}\n`);

  console.log(`💾 Updating faculty document to link UID: ${uid}...`);
  await facultyRef.update({
    uid,
    updatedAt: new Date(),
  });

  console.log('✅ Successfully linked UID to faculty document');
}

fixDrSibiUid()
  .then(() => {
    console.log('\n✅ Fix complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
