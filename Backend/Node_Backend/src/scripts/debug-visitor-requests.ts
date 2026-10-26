/**
 * Debug script to check visitor requests for sapfire955@gmail.com
 */

import { getFirestore } from '../config/firebase.admin';

const VISITS_COLLECTION = process.env.FIRESTORE_COLLECTION_VISIT_REQUESTS || 'visitRequests';

async function debugVisitorRequests() {
  console.log('🔍 Debugging visitor requests for sapfire955@gmail.com\n');

  const db = getFirestore();
  
  // Find user by email
  const usersSnap = await db.collection('users')
    .where('email', '==', 'sapfire955@gmail.com')
    .limit(1)
    .get();

  if (usersSnap.empty) {
    console.log('❌ User not found with email sapfire955@gmail.com');
    return;
  }

  const userDoc = usersSnap.docs[0];
  const userData = userDoc.data();
  const userId = userDoc.id;

  console.log('✅ Found user:');
  console.log(`   ID: ${userId}`);
  console.log(`   Name: ${userData.name}`);
  console.log(`   Email: ${userData.email}`);
  console.log(`   Role: ${userData.role}`);
  console.log(`   UID: ${userData.uid || '(not set)'}\n`);

  // Query all visit requests for this user by document ID
  console.log(`📋 Searching by requesterId == ${userId}...\n`);
  const requestsByDocId = await db.collection(VISITS_COLLECTION)
    .where('requesterId', '==', userId)
    .get();

  console.log(`   Found ${requestsByDocId.size} requests by document ID\n`);

  // Query by uid if different
  if (userData.uid && userData.uid !== userId) {
    console.log(`📋 Searching by requesterId == ${userData.uid} (uid)...\n`);
    const requestsByUid = await db.collection(VISITS_COLLECTION)
      .where('requesterId', '==', userData.uid)
      .get();
    console.log(`   Found ${requestsByUid.size} requests by uid\n`);
  }

  // Search by email to find all requests
  console.log(`📋 Searching by requesterEmail == sapfire955@gmail.com...\n`);
  const requestsByEmail = await db.collection(VISITS_COLLECTION)
    .where('requesterEmail', '==', 'sapfire955@gmail.com')
    .get();

  console.log(`   Found ${requestsByEmail.size} requests by email\n`);

  if (requestsByEmail.size > 0) {
    requestsByEmail.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`Request ${index + 1}: ${doc.id}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Destination: ${data.destination}`);
      console.log(`   Purpose: ${data.purpose}`);
      console.log(`   Requester ID: ${data.requesterId} ${data.requesterId === userId ? '✅ MATCHES' : '❌ MISMATCH'}`);
      console.log(`   Requester Email: ${data.requesterEmail}`);
      console.log(`   Target Faculty: ${data.targetFacultyName} (ID: ${data.targetFacultyId})`);
      console.log(`   Visit Date: ${data.visitDate}`);
      console.log(`   Time Window: ${data.timeWindow}`);
      console.log(`   Created: ${data.createdAt?.toDate?.()?.toISOString() || data.createdAt}`);
      console.log(`   Reviewed: ${data.reviewedAt?.toDate?.()?.toISOString() || data.reviewedAt || '(not reviewed)'}`);
      console.log(`   Permit ID: ${data.permitId || '(no permit)'}`);
      console.log();
    });
  }
}

debugVisitorRequests()
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
