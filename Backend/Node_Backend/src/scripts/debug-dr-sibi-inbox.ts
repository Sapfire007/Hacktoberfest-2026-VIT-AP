/**
 * Debug Dr. Sibi's inbox issue
 */

import { getFirestore } from '../config/firebase.admin';

const VISITS_COLLECTION = process.env.FIRESTORE_COLLECTION_VISIT_REQUESTS || 'visitRequests';

async function debugDrSibiInbox() {
  console.log('🔍 Debugging Dr. Sibi Chakkaravarthy S inbox\n');

  const db = getFirestore();
  
  // Get faculty document
  const facultyRef = db.collection('faculty').doc('sibi870084');
  const facultyDoc = await facultyRef.get();

  if (!facultyDoc.exists) {
    console.log('❌ Faculty document not found');
    return;
  }

  const facultyData = facultyDoc.data()!;
  console.log('✅ Faculty document:');
  console.log(`   ID: ${facultyDoc.id}`);
  console.log(`   Name: ${facultyData.name}`);
  console.log(`   Email: ${facultyData.email}`);
  console.log(`   UID: ${facultyData.uid || '(not set)'}\n`);

  // Check for users with this UID
  if (facultyData.uid) {
    console.log(`📋 Searching for auth user with uid=${facultyData.uid}...\n`);
    const userByUid = await db.collection('users').doc(facultyData.uid).get();
    
    if (userByUid.exists) {
      console.log('✅ Found user document by uid:');
      console.log(`   ID: ${userByUid.id}`);
      console.log(`   Data:`, userByUid.data());
    } else {
      console.log(`❌ No user document with ID ${facultyData.uid}`);
    }
    console.log();
  }

  // Check for users with this email
  console.log(`📋 Searching for auth user with email=${facultyData.email}...\n`);
  const usersByEmail = await db.collection('users')
    .where('email', '==', facultyData.email)
    .get();

  if (usersByEmail.empty) {
    console.log('❌ No user documents found with this email');
  } else {
    console.log(`✅ Found ${usersByEmail.size} user(s) with this email:`);
    usersByEmail.docs.forEach((doc) => {
      const data = doc.data();
      console.log(`   User ID: ${doc.id}`);
      console.log(`   UID: ${data.uid || '(not set)'}`);
      console.log(`   Email: ${data.email}`);
      console.log(`   Role: ${data.role}`);
      console.log();
    });
  }

  // Search for visit requests by targetFacultyId
  console.log(`📋 Searching for visit requests where targetFacultyId=sibi870084...\n`);
  const requestsByFacultyId = await db.collection(VISITS_COLLECTION)
    .where('targetFacultyId', '==', 'sibi870084')
    .get();

  console.log(`   Found ${requestsByFacultyId.size} requests\n`);

  if (requestsByFacultyId.size > 0) {
    requestsByFacultyId.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`Request ${index + 1}: ${doc.id}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Destination: ${data.destination}`);
      console.log(`   Requester: ${data.requesterName} (${data.requesterEmail})`);
      console.log(`   Created: ${data.createdAt?.toDate?.()?.toISOString() || data.createdAt}`);
      console.log();
    });
  }
}

debugDrSibiInbox()
  .then(() => {
    console.log('✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
