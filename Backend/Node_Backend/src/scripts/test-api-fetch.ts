/**
 * Test API fetch for visitor and faculty requests
 * 
 * Simulates what the mobile app does to verify requests are being returned
 */

import { listByRequester, listForFaculty } from '../services/visit.service';

async function testAPIFetch() {
  console.log('🧪 Testing API request fetch\n');

  // Test 1: Fetch visitor requests (simulating visitAPI.mine())
  console.log('Test 1: Fetch visitor requests');
  console.log('================================');
  const visitorUid = '31dih5uBjqacLLwurFCyE7WsmnT2';
  console.log(`Fetching requests for visitor uid: ${visitorUid}\n`);

  const visitorRequests = await listByRequester(visitorUid);
  console.log(`✅ Returned ${visitorRequests.length} requests:\n`);
  
  visitorRequests.forEach((req, index) => {
    console.log(`Request ${index + 1}:`);
    console.log(`   ID: ${req.id}`);
    console.log(`   Status: ${req.status}`);
    console.log(`   Destination: ${req.destination}`);
    console.log(`   Faculty: ${req.targetFacultyName}`);
    console.log(`   Created: ${req.createdAt}`);
    console.log();
  });

  if (visitorRequests.length === 0) {
    console.log('❌ NO REQUESTS RETURNED - This is the issue!\n');
  }

  // Test 2: Fetch faculty pending requests (simulating visitAPI.inbox('pending'))
  console.log('\nTest 2: Fetch faculty pending requests');
  console.log('========================================');
  const facultyId = 'sibi870084';
  console.log(`Fetching pending requests for faculty: ${facultyId}\n`);

  const facultyPendingRequests = await listForFaculty(facultyId, 'pending');
  console.log(`✅ Returned ${facultyPendingRequests.length} pending requests\n`);

  if (facultyPendingRequests.length === 0) {
    console.log('ℹ️  No pending requests (expected - all are permit_active)\n');
  }

  // Test 3: Fetch faculty ALL requests (simulating visitAPI.inbox('all'))
  console.log('\nTest 3: Fetch faculty ALL requests');
  console.log('====================================');
  console.log(`Fetching ALL requests for faculty: ${facultyId}\n`);

  const facultyAllRequests = await listForFaculty(facultyId, 'all');
  console.log(`✅ Returned ${facultyAllRequests.length} total requests:\n`);

  facultyAllRequests.forEach((req, index) => {
    console.log(`Request ${index + 1}:`);
    console.log(`   ID: ${req.id}`);
    console.log(`   Status: ${req.status}`);
    console.log(`   Requester: ${req.requesterName} (${req.requesterEmail})`);
    console.log(`   Destination: ${req.destination}`);
    console.log();
  });

  if (facultyAllRequests.length === 0) {
    console.log('❌ NO REQUESTS RETURNED - This is the issue!\n');
  }

  // Summary
  console.log('\n📊 Summary');
  console.log('==========');
  console.log(`Visitor requests: ${visitorRequests.length}/3 expected`);
  console.log(`Faculty pending: ${facultyPendingRequests.length}/0 expected (all are permit_active)`);
  console.log(`Faculty all: ${facultyAllRequests.length}/3 expected`);

  const allPass = visitorRequests.length === 3 && facultyAllRequests.length === 3;
  
  if (allPass) {
    console.log('\n✅ All requests are being fetched correctly!');
    console.log('The backend is working. Issue may be in frontend filtering or rendering.');
  } else {
    console.log('\n❌ Requests are NOT being fetched properly!');
    console.log('The backend query logic needs investigation.');
  }
}

testAPIFetch()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
