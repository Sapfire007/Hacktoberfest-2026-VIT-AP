/**
 * List all Firestore collections
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'vision-9ddb7.appspot.com'
});

const db = admin.firestore();

async function listCollections() {
  console.log('🔍 Listing all top-level Firestore collections...\n');

  try {
    const collections = await db.listCollections();
    
    console.log(`Found ${collections.length} collection(s):\n`);
    
    for (const collection of collections) {
      console.log(`📁 ${collection.id}`);
      
      // Get document count
      const snapshot = await collection.limit(5).get();
      console.log(`   └─ ${snapshot.size} document(s) (showing first 5)`);
      
      if (snapshot.size > 0) {
        snapshot.forEach((doc, index) => {
          console.log(`      ${index + 1}. ${doc.id}`);
        });
      }
      console.log('');
    }

    // Now specifically check for identity-related collections
    console.log('\n🔎 Searching for identity-related documents...\n');
    
    const userId = 'nZU3zTVejbhk5cPFl5i9p4PkeM82';
    
    // Check users collection for identity document
    console.log(`📋 Checking users/${userId} for identityDocument field...`);
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log('User fields:', Object.keys(userData));
      
      if (userData.identityDocument) {
        console.log('\n✅ identityDocument field EXISTS in users collection!');
        console.log('Type:', typeof userData.identityDocument);
        console.log('Length:', userData.identityDocument.length);
        console.log('Preview:', userData.identityDocument.substring(0, 100) + '...');
        
        if (userData.identityDocument.startsWith('data:image/')) {
          console.log('✅ Format: Data URI (base64)');
        } else if (userData.identityDocument.startsWith('http')) {
          console.log('✅ Format: HTTP URL');
        } else {
          console.log('⚠️  Format: Unknown');
        }
        
        if (userData.identityDocumentType) {
          console.log('Document Type:', userData.identityDocumentType);
        }
      } else {
        console.log('❌ No identityDocument field in users document');
      }
    } else {
      console.log('❌ User document not found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

listCollections();
