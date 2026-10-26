/**
 * Sync visitor requests to current Firebase Auth user ID
 * 
 * Fixes the mismatch where requests have one user ID but the app session uses another
 */

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from '../config/firebase.admin';

const VISITS_COLLECTION = process.env.FIRESTORE_COLLECTION_VISIT_REQUESTS || 'visitRequests';

async function syncVisitorRequests() {
  console.log('🔄 Syncing visitor requests to current Firebase Auth user\n');

  const db = getFirestore();
  const auth = getAuth();
  
  const email = 'sapfire955@gmail.com';
  
  // Get the CURRENT Firebase Auth user for this email
  try {
    const userRecord = await auth.getUserByEmail(email);
    console.log('✅ Found Firebase Auth user:');
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Created: ${userRecord.metadata.creationTime}\n`);

    // Get the users collection document
    const usersSnap = await db.collection('users')
      .where('email', '==', email)
      .get();

    if (usersSnap.empty) {
      console.log('❌ No users collection document found');
      console.log('Creating one now...');
      
      await db.collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: userRecord.email,
        role: 'visitor',
        createdAt: new Date(),
      });
      
      console.log('✅ Created users document\n');
    } else {
      const userDoc = usersSnap.docs[0];
      console.log('✅ Found users collection document:');
      console.log(`   Document ID: ${userDoc.id}`);
      console.log(`   UID field: ${userDoc.data().uid}\n`);
      
      if (userDoc.id !== userRecord.uid) {
        console.log('⚠️  MISMATCH: Document ID does not match Firebase Auth UID');
        console.log(`   Firebase Auth UID: ${userRecord.uid}`);
        console.log(`   Users doc ID: ${userDoc.id}\n`);
      }
    }

    // Now update ALL visit requests to use the current Firebase Auth UID
    const requestsSnap = await db.collection(VISITS_COLLECTION)
      .where('requesterEmail', '==', email)
      .get();

    console.log(`📋 Found ${requestsSnap.size} visit requests for ${email}\n`);

    if (requestsSnap.empty) {
      console.log('No requests to update');
      return;
    }

    const batch = db.batch();
    let updateCount = 0;

    requestsSnap.docs.forEach((doc) => {
      const currentRequesterId = doc.data().requesterId;
      
      if (currentRequesterId !== userRecord.uid) {
        console.log(`🔧 Updating request ${doc.id}:`);
        console.log(`   Old requesterId: ${currentRequesterId}`);
        console.log(`   New requesterId: ${userRecord.uid}`);
        
        batch.update(doc.ref, {
          requesterId: userRecord.uid,
          updatedAt: new Date(),
        });
        
        updateCount++;
      }
    });

    if (updateCount > 0) {
      console.log(`\n💾 Committing ${updateCount} updates...`);
      await batch.commit();
      console.log('✅ Successfully updated all requests');
    } else {
      console.log('\n✅ All requests already have correct requesterId');
    }

  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.log('❌ No Firebase Auth user exists for', email);
      console.log('The user needs to sign in at least once to create the auth record');
    } else {
      throw error;
    }
  }
}

syncVisitorRequests()
  .then(() => {
    console.log('\n✅ Sync complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
