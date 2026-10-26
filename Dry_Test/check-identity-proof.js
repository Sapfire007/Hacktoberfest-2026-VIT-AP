/**
 * Check identityProof field
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'vision-9ddb7.appspot.com'
});

const db = admin.firestore();

async function checkIdentityProof() {
  const userId = 'nZU3zTVejbhk5cPFl5i9p4PkeM82';
  
  console.log(`🔍 Checking identityProof for user: ${userId}\n`);

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log('❌ User not found');
      process.exit(1);
    }

    const userData = userDoc.data();
    
    if (!userData.identityProof) {
      console.log('❌ No identityProof field');
      process.exit(1);
    }

    console.log('✅ identityProof field exists!\n');
    console.log('Type:', typeof userData.identityProof);
    
    if (typeof userData.identityProof === 'string') {
      console.log('Length:', userData.identityProof.length, 'characters');
      console.log('\nFirst 200 characters:');
      console.log(userData.identityProof.substring(0, 200));
      console.log('\nLast 100 characters:');
      console.log(userData.identityProof.substring(userData.identityProof.length - 100));
      
      if (userData.identityProof.startsWith('data:image/')) {
        console.log('\n✅ Format: Data URI (base64 encoded image)');
        const match = userData.identityProof.match(/data:(image\/\w+);base64,/);
        if (match) {
          console.log('MIME Type:', match[1]);
        }
      } else if (userData.identityProof.startsWith('http')) {
        console.log('\n✅ Format: HTTP URL');
      } else if (userData.identityProof.startsWith('gs://')) {
        console.log('\n✅ Format: Firebase Storage gs:// URL');
      } else {
        console.log('\n⚠️  Format: Unknown/Custom');
      }
    } else if (typeof userData.identityProof === 'object') {
      console.log('\n📦 identityProof is an object:');
      console.log(JSON.stringify(userData.identityProof, null, 2));
    }

    // Check for identityProofType or similar
    if (userData.identityProofType) {
      console.log('\nDocument Type:', userData.identityProofType);
    }
    if (userData.identityDocumentType) {
      console.log('Document Type:', userData.identityDocumentType);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

checkIdentityProof();
