/**
 * Debug script to check the Oct 7, 2026 request status
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkOct7Request() {
  console.log('🔍 Checking Oct 7, 2026 request...\n');

  try {
    const requestsRef = collection(db, 'visitRequests');
    const q = query(requestsRef, where('visitDate', '==', 'Oct 7, 2026'));
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('❌ No request found with visitDate = "Oct 7, 2026"');
      return;
    }

    snapshot.forEach((doc) => {
      const data = doc.data();
      console.log('📄 Request ID:', doc.id);
      console.log('👤 Requester:', data.requesterName);
      console.log('📅 Visit Date:', data.visitDate);
      console.log('📍 Destination:', data.destination);
      console.log('🏷️  Status:', data.status);
      console.log('✅ Approved At:', data.approvedAt);
      console.log('💬 Faculty Remarks:', data.facultyRemarks);
      console.log('🎯 Target Faculty:', data.targetFacultyId);
      console.log('\n📦 Full data:', JSON.stringify(data, null, 2));
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

checkOct7Request();
