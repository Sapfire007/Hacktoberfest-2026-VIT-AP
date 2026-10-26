/**
 * Fix requesterId mismatch for sapfire955@gmail.com
 * 
 * Updates visit requests that have correct email but wrong requesterId
 */

import { getFirestore } from '../config/firebase.admin';

const VISITS_COLLECTION = process.env.FIRESTORE_COLLECTION_VISIT_REQUESTS || 'visitRequests';

async function fixVisitorRequesterIds() {
  console.log('🔧 Fixing requester IDs for sapfire955@gmail.com\n');

  const db = getFirestore();
  
  // Find current user
  const usersSnap = await db.collection('users')
    .where('email', '==', 'sapfire955@gmail.com')
    .limit(1)
    .get();

  if (usersSnap.empty) {
    console.log('❌ User not found');
    return;
  }

  const userDoc = usersSnap.docs[0];
  const userData = userDoc.data();
  const correctUserId = userDoc.id;

  console.log('✅ Found user:');
  console.log(`   Current ID: ${correctUserId}`);
  console.log(`   Name: ${userData.name || '(not set)'}`);
  console.log(`   Email: ${userData.email}`);
  console.log(`   UID: ${userData.uid || '(not set)'}\n`);

  // Find all requests with this email
  const requestsSnap = await db.collection(VISITS_COLLECTION)
    .where('requesterEmail', '==', 'sapfire955@gmail.com')
    .get();

  console.log(`📋 Found ${requestsSnap.size} requests with email sapfire955@gmail.com\n`);

  if (requestsSnap.empty) {
    console.log('✅ No requests to fix');
    return;
  }

  const batch = db.batch();
  let fixCount = 0;

  requestsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const currentRequesterId = data.requesterId;

    if (currentRequesterId !== correctUserId) {
      console.log(`🔧 Fixing request ${doc.id}:`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Destination: ${data.destination}`);
      console.log(`   Old requesterId: ${currentRequesterId}`);
      console.log(`   New requesterId: ${correctUserId}`);
      console.log();

      batch.update(doc.ref, {
        requesterId: correctUserId,
        updatedAt: new Date(),
      });

      fixCount++;
    }
  });

  if (fixCount === 0) {
    console.log('✅ All requester IDs are correct, no updates needed');
    return;
  }

  console.log(`\n💾 Committing ${fixCount} updates...`);
  await batch.commit();
  console.log(`✅ Successfully updated ${fixCount} requests`);
}

fixVisitorRequesterIds()
  .then(() => {
    console.log('\n✅ Fix complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
