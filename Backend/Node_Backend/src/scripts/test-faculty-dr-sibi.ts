/**
 * Test Dr. Sibi's faculty access
 * 
 * Simulates what happens when faculty logs in and accesses their history
 */

import { resolveFacultyForUser } from '../services/faculty.service';
import { listForFaculty } from '../services/visit.service';

async function testFacultyDrSibi() {
  console.log('🧪 Testing Dr. Sibi Chakkaravarthy S faculty access\n');

  // When faculty signs in, they get:
  // - uid: faculty_sibi870084 (or similar)
  // - employeeId: sibi870084 (custom claim)
  
  const testCases = [
    {
      name: 'With synthetic UID',
      uid: 'faculty_sibi870084',
      employeeId: 'sibi870084',
    },
    {
      name: 'With just employeeId',
      uid: 'random_uid_123',
      employeeId: 'sibi870084',
    },
    {
      name: 'With document ID extracted from UID',
      uid: 'faculty_sibi870084',
      employeeId: undefined,
    },
  ];

  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    console.log('='.repeat(50));
    console.log(`Input: uid="${testCase.uid}", employeeId="${testCase.employeeId}"`);

    try {
      // Step 1: Resolve faculty (what backend does on every request)
      const faculty = await resolveFacultyForUser(testCase.uid, testCase.employeeId);

      if (!faculty) {
        console.log('❌ Faculty resolution failed - would return 403 Forbidden');
        continue;
      }

      console.log('✅ Faculty resolved:');
      console.log(`   ID: ${faculty.id}`);
      console.log(`   Name: ${faculty.name}`);
      console.log(`   Email: ${faculty.email}`);

      // Step 2: Fetch ALL requests for this faculty
      const allRequests = await listForFaculty(faculty.id, 'all');
      console.log(`\n📋 Fetched ${allRequests.length} total requests:`);

      if (allRequests.length > 0) {
        allRequests.forEach((req, index) => {
          console.log(`   ${index + 1}. ${req.id} - ${req.status} - ${req.requesterName}`);
        });
      } else {
        console.log('   (No requests found)');
      }

      // Step 3: Fetch pending requests
      const pendingRequests = await listForFaculty(faculty.id, 'pending');
      console.log(`\n📥 Fetched ${pendingRequests.length} pending requests`);

    } catch (error) {
      console.log(`❌ Error: ${(error as Error).message}`);
    }
  }

  // Final check: Direct query by faculty ID
  console.log('\n\n📊 Direct Database Query');
  console.log('='.repeat(50));
  const directRequests = await listForFaculty('sibi870084', 'all');
  console.log(`Requests for facultyId="sibi870084": ${directRequests.length}`);
  
  if (directRequests.length > 0) {
    console.log('\nRequest details:');
    directRequests.forEach((req) => {
      console.log(`  - ${req.id}`);
      console.log(`    targetFacultyId: ${req.targetFacultyId}`);
      console.log(`    targetFacultyName: ${req.targetFacultyName}`);
      console.log(`    status: ${req.status}`);
      console.log(`    requester: ${req.requesterName} (${req.requesterEmail})`);
      console.log();
    });
  }
}

testFacultyDrSibi()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
