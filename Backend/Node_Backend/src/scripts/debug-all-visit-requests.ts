/**
 * Debug all visit requests in Firestore
 * 
 * Analyzes the visitRequests collection to identify why past requests
 * aren't showing up in visitor or faculty views.
 */

import { getFirestore } from '../config/firebase.admin';

const VISITS_COLLECTION = process.env.FIRESTORE_COLLECTION_VISIT_REQUESTS || 'visitRequests';

async function debugAllVisitRequests() {
  console.log('🔍 Analyzing all visit requests in Firestore\n');

  const db = getFirestore();
  
  // Get all visit requests
  const allRequests = await db.collection(VISITS_COLLECTION).get();
  
  console.log(`📊 Total visit requests: ${allRequests.size}\n`);

  // Group by requester email
  const byRequesterEmail = new Map<string, any[]>();
  const byTargetFacultyId = new Map<string, any[]>();
  const byStatus = new Map<string, number>();
  
  let missingRequesterId = 0;
  let missingTargetFacultyId = 0;
  let missingRequesterEmail = 0;

  allRequests.docs.forEach((doc) => {
    const data = doc.data();
    
    // Count by status
    const status = data.status || 'unknown';
    byStatus.set(status, (byStatus.get(status) || 0) + 1);

    // Check for missing critical fields
    if (!data.requesterId) missingRequesterId++;
    if (!data.targetFacultyId) missingTargetFacultyId++;
    if (!data.requesterEmail) missingRequesterEmail++;

    // Group by requester email
    const email = data.requesterEmail || 'no-email';
    if (!byRequesterEmail.has(email)) {
      byRequesterEmail.set(email, []);
    }
    byRequesterEmail.get(email)!.push({
      id: doc.id,
      requesterId: data.requesterId,
      status: data.status,
      targetFacultyId: data.targetFacultyId,
      targetFacultyName: data.targetFacultyName,
      destination: data.destination,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
    });

    // Group by target faculty
    const facultyId = data.targetFacultyId || 'no-faculty';
    if (!byTargetFacultyId.has(facultyId)) {
      byTargetFacultyId.set(facultyId, []);
    }
    byTargetFacultyId.get(facultyId)!.push({
      id: doc.id,
      requesterId: data.requesterId,
      requesterEmail: data.requesterEmail,
      requesterName: data.requesterName,
      status: data.status,
      destination: data.destination,
    });
  });

  console.log('📊 Breakdown by Status:');
  console.log('========================');
  byStatus.forEach((count, status) => {
    console.log(`   ${status}: ${count}`);
  });
  console.log();

  console.log('⚠️  Data Integrity Issues:');
  console.log('===========================');
  console.log(`   Missing requesterId: ${missingRequesterId}`);
  console.log(`   Missing targetFacultyId: ${missingTargetFacultyId}`);
  console.log(`   Missing requesterEmail: ${missingRequesterEmail}`);
  console.log();

  console.log('👥 Requests by Requester Email:');
  console.log('================================');
  let visitorCount = 0;
  
  for (const [email, requests] of byRequesterEmail.entries()) {
    if (email !== 'no-email') {
      visitorCount++;
      console.log(`\n${email} (${requests.length} requests):`);
      
      // Check if user exists
      const userQuery = await db.collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (userQuery.empty) {
        console.log('   ❌ NO USER DOCUMENT FOUND');
      } else {
        const userId = userQuery.docs[0].id;
        console.log(`   ✅ User ID: ${userId}`);
        
        // Check which requests match/mismatch
        requests.forEach((req) => {
          const matches = req.requesterId === userId;
          console.log(`      ${matches ? '✅' : '❌'} ${req.id} - requesterId: ${req.requesterId} (${req.status})`);
        });
      }
    }
  }
  console.log(`\nTotal unique visitors: ${visitorCount}`);

  console.log('\n\n👨‍🏫 Requests by Target Faculty:');
  console.log('==================================');
  let facultyCount = 0;
  const topFaculty = Array.from(byTargetFacultyId.entries())
    .filter(([id]) => id !== 'no-faculty')
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  for (const [facultyId, requests] of topFaculty) {
    facultyCount++;
    
    // Check if faculty exists
    const facultyDoc = await db.collection('faculty').doc(facultyId).get();
    
    if (!facultyDoc.exists) {
      console.log(`\n❌ ${facultyId} (${requests.length} requests) - FACULTY NOT FOUND`);
    } else {
      const facultyData = facultyDoc.data()!;
      console.log(`\n✅ ${facultyData.name} (${requests.length} requests)`);
      console.log(`   Document ID: ${facultyId}`);
      console.log(`   UID field: ${facultyData.uid || '(not set)'}`);
      
      // Show request statuses
      const statusBreakdown: Record<string, number> = {};
      requests.forEach(req => {
        statusBreakdown[req.status] = (statusBreakdown[req.status] || 0) + 1;
      });
      console.log(`   Status breakdown: ${JSON.stringify(statusBreakdown)}`);
    }
  }

  console.log(`\n\nTotal faculty with requests: ${byTargetFacultyId.size - (byTargetFacultyId.has('no-faculty') ? 1 : 0)}`);
}

debugAllVisitRequests()
  .then(() => {
    console.log('\n\n✅ Analysis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
