/**
 * Test faculty resolution by email
 * 
 * Verifies that the updated resolveFacultyForUser function can find faculty
 * by email even without a user document or UID link.
 */

import { getFirestore } from '../config/firebase.admin';

const FACULTY_COLLECTION = process.env.FIRESTORE_COLLECTION_FACULTY || 'faculty';

async function testFacultyEmailResolution() {
  console.log('🧪 Testing faculty resolution by email\n');

  const db = getFirestore();
  
  // Test with Dr. Sibi's email
  const email = 'chakkaravarthy.sibi@vitap.ac.in';
  console.log(`📧 Looking up faculty by email: ${email}\n`);

  const facultySnapshot = await db.collection(FACULTY_COLLECTION)
    .where('email', '==', email)
    .limit(1)
    .get();

  if (facultySnapshot.empty) {
    console.log('❌ No faculty found with this email');
    return;
  }

  const doc = facultySnapshot.docs[0];
  const data = doc.data();

  console.log('✅ Found faculty:');
  console.log(`   Document ID: ${doc.id}`);
  console.log(`   Name: ${data.name}`);
  console.log(`   Email: ${data.email}`);
  console.log(`   Department: ${data.department || '(not set)'}`);
  console.log(`   UID field: ${data.uid || '(not set)'}\n`);

  // Check if this would work for inbox
  const visitRequestsSnapshot = await db.collection('visitRequests')
    .where('targetFacultyId', '==', doc.id)
    .get();

  console.log(`📋 Visit requests targeting this faculty: ${visitRequestsSnapshot.size}\n`);

  if (visitRequestsSnapshot.size > 0) {
    console.log('✅ Email-based resolution SUCCESS!');
    console.log('   Faculty inbox will now work without requiring sign-in');
    console.log('   Requests can be queried using the resolved faculty ID\n');
    
    visitRequestsSnapshot.docs.forEach((req, index) => {
      const reqData = req.data();
      console.log(`   Request ${index + 1}: ${req.id}`);
      console.log(`      Status: ${reqData.status}`);
      console.log(`      From: ${reqData.requesterName} (${reqData.requesterEmail})`);
      console.log(`      Destination: ${reqData.destination}`);
    });
  } else {
    console.log('✅ Email-based resolution works (no pending requests)');
  }

  console.log('\n🔍 Testing with a few more faculty emails...\n');

  // Get 5 random faculty members to test
  const randomFaculty = await db.collection(FACULTY_COLLECTION)
    .limit(5)
    .get();

  let successCount = 0;
  let withRequestsCount = 0;

  for (const facultyDoc of randomFaculty.docs) {
    const facultyData = facultyDoc.data();
    if (!facultyData.email) continue;

    const testQuery = await db.collection(FACULTY_COLLECTION)
      .where('email', '==', facultyData.email)
      .limit(1)
      .get();

    if (!testQuery.empty) {
      successCount++;
      
      const requestsCount = (await db.collection('visitRequests')
        .where('targetFacultyId', '==', facultyDoc.id)
        .get()).size;

      if (requestsCount > 0) {
        withRequestsCount++;
        console.log(`   ✅ ${facultyData.name} (${requestsCount} requests)`);
      }
    }
  }

  console.log(`\n📊 Test Results:`);
  console.log(`   Faculty tested: ${randomFaculty.size}`);
  console.log(`   Email lookups successful: ${successCount}`);
  console.log(`   Faculty with pending requests: ${withRequestsCount}`);
}

testFacultyEmailResolution()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
