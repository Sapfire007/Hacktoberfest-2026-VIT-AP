/**
 * Fix requesterId mismatches for ALL users
 * 
 * Finds all visit requests where requesterEmail matches a user but requesterId doesn't,
 * and updates them to use the correct current user ID.
 */

import { getFirestore } from '../config/firebase.admin';

const VISITS_COLLECTION = process.env.FIRESTORE_COLLECTION_VISIT_REQUESTS || 'visitRequests';

async function fixAllRequesterIdMismatches() {
  console.log('🔧 Finding and fixing requesterId mismatches for all users...\n');

  const db = getFirestore();
  
  // Get all unique requester emails from visit requests
  const requestsSnapshot = await db.collection(VISITS_COLLECTION).get();
  const emailToRequestsMap = new Map<string, FirebaseFirestore.DocumentSnapshot[]>();

  requestsSnapshot.docs.forEach((doc) => {
    const email = doc.data().requesterEmail;
    if (email) {
      if (!emailToRequestsMap.has(email)) {
        emailToRequestsMap.set(email, []);
      }
      emailToRequestsMap.get(email)!.push(doc);
    }
  });

  console.log(`📋 Found ${emailToRequestsMap.size} unique requester emails in ${requestsSnapshot.size} requests\n`);

  let totalFixed = 0;
  let totalChecked = 0;
  const issues: string[] = [];

  // Process each email
  for (const [email, requests] of emailToRequestsMap) {
    totalChecked++;
    
    // Find current user with this email
    const userSnapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      issues.push(`⚠️  No user found for email: ${email} (${requests.length} requests)`);
      continue;
    }

    const userDoc = userSnapshot.docs[0];
    const correctUserId = userDoc.id;

    // Check which requests have wrong requesterId
    const mismatched = requests.filter(req => req.data().requesterId !== correctUserId);

    if (mismatched.length > 0) {
      console.log(`🔧 Fixing ${mismatched.length} requests for ${email}:`);
      console.log(`   Current user ID: ${correctUserId}`);
      console.log(`   Wrong IDs: ${[...new Set(mismatched.map(r => r.data().requesterId))].join(', ')}`);

      const batch = db.batch();
      mismatched.forEach((req) => {
        batch.update(req.ref, {
          requesterId: correctUserId,
          updatedAt: new Date(),
        });
      });

      await batch.commit();
      totalFixed += mismatched.length;
      console.log(`   ✅ Fixed ${mismatched.length} requests\n`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Emails checked: ${totalChecked}`);
  console.log(`   Requests fixed: ${totalFixed}`);
  console.log(`   Issues found: ${issues.length}\n`);

  if (issues.length > 0) {
    console.log('⚠️  Issues (no matching user):');
    issues.forEach(issue => console.log(`   ${issue}`));
  }
}

fixAllRequesterIdMismatches()
  .then(() => {
    console.log('\n✅ Fix complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
