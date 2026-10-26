/**
 * Verify faculty UID coverage
 * 
 * Checks how many faculty members have UID fields set
 */

import { getFirestore } from '../config/firebase.admin';

async function verifyFacultyUidCoverage() {
  console.log('🔍 Verifying faculty UID coverage...\n');

  const db = getFirestore();
  
  const facultySnapshot = await db.collection('faculty').get();
  const total = facultySnapshot.size;
  
  let withUid = 0;
  let withoutUid = 0;
  const missingUid: string[] = [];

  facultySnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.uid) {
      withUid++;
    } else {
      withoutUid++;
      missingUid.push(`${data.name || 'Unknown'} (${doc.id})`);
    }
  });

  console.log('📊 Summary:');
  console.log(`   Total faculty: ${total}`);
  console.log(`   With UID: ${withUid} (${((withUid/total)*100).toFixed(1)}%)`);
  console.log(`   Without UID: ${withoutUid} (${((withoutUid/total)*100).toFixed(1)}%)\n`);

  if (withoutUid > 0) {
    console.log('⚠️  Faculty members still missing UID:');
    missingUid.slice(0, 10).forEach((name) => {
      console.log(`   - ${name}`);
    });
    if (missingUid.length > 10) {
      console.log(`   ... and ${missingUid.length - 10} more\n`);
    }
  } else {
    console.log('✅ All faculty members have UID fields set!\n');
  }

  // Check specific Dr. Sibi
  console.log('🔍 Checking Dr. Sibi Chakkaravarthy S specifically...');
  const sibiDoc = await db.collection('faculty').doc('sibi870084').get();
  if (sibiDoc.exists) {
    const sibiData = sibiDoc.data()!;
    console.log(`   UID: ${sibiData.uid || '❌ NOT SET'}`);
    
    // Check if user document exists
    if (sibiData.uid) {
      const userDoc = await db.collection('users').doc(sibiData.uid).get();
      if (userDoc.exists) {
        console.log(`   User document: ✅ EXISTS`);
        console.log(`   User email: ${userDoc.data()?.email}`);
      } else {
        console.log(`   User document: ❌ DOES NOT EXIST`);
        console.log(`   Status: Faculty has never signed in`);
      }
    }
  }
}

verifyFacultyUidCoverage()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
