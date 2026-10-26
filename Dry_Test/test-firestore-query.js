/**
 * Test script to query identity_documents collection
 * Run with: node test-firestore-query.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'vision-9ddb7.appspot.com'
});

const db = admin.firestore();

async function testIdentityDocuments() {
  console.log('🔍 Testing identity_documents collection...\n');

  const userId = 'nZU3zTVejbhk5cPFl5i9p4PkeM82';

  try {
    // Test 1: Get all documents in identity_documents
    console.log('📋 Test 1: Fetching ALL identity_documents...');
    const allDocs = await db.collection('identity_documents').limit(5).get();
    
    console.log(`Found ${allDocs.size} document(s)\n`);
    
    allDocs.forEach((doc, index) => {
      console.log(`\n--- Document ${index + 1}: ${doc.id} ---`);
      const data = doc.data();
      console.log(JSON.stringify(data, null, 2));
      console.log('Fields:', Object.keys(data));
    });

    // Test 2: Try to find by userId field
    console.log('\n\n📋 Test 2: Query by userId field...');
    const byUserId = await db.collection('identity_documents')
      .where('userId', '==', userId)
      .get();
    
    console.log(`Found ${byUserId.size} document(s)`);
    if (!byUserId.empty) {
      byUserId.forEach(doc => {
        console.log('Document ID:', doc.id);
        console.log('Data:', JSON.stringify(doc.data(), null, 2));
      });
    }

    // Test 3: Check if document ID matches userId
    console.log('\n\n📋 Test 3: Try direct document lookup by userId...');
    const directDoc = await db.collection('identity_documents').doc(userId).get();
    
    if (directDoc.exists) {
      console.log('✅ Found document with ID matching userId!');
      console.log('Data:', JSON.stringify(directDoc.data(), null, 2));
    } else {
      console.log('❌ No document with ID matching userId');
    }

    // Test 4: Parse storageUri to get userId
    console.log('\n\n📋 Test 4: Check storageUri pattern...');
    if (allDocs.size > 0) {
      const firstDoc = allDocs.docs[0];
      const data = firstDoc.data();
      
      if (data.storageUri) {
        console.log('StorageUri:', data.storageUri);
        
        // Try to extract userId from storageUri
        const match = data.storageUri.match(/users\/([^\/]+)/);
        if (match) {
          const extractedUserId = match[1];
          console.log('Extracted userId from storageUri:', extractedUserId);
          
          if (extractedUserId === userId) {
            console.log('✅ Match! This is the correct document');
          }
        }
      }
    }

    // Test 5: Try to generate signed URL from storage
    console.log('\n\n📋 Test 5: Test Firebase Storage signed URL...');
    if (allDocs.size > 0) {
      const firstDoc = allDocs.docs[0];
      const data = firstDoc.data();
      
      if (data.storageUri) {
        try {
          const bucket = admin.storage().bucket();
          
          // Parse the storageUri
          let filePath = data.storageUri;
          if (filePath.startsWith('firestore://')) {
            filePath = filePath.replace('firestore://', '');
          }
          
          console.log('Attempting to get file:', filePath);
          
          const file = bucket.file(filePath);
          const [exists] = await file.exists();
          
          console.log('File exists in storage:', exists);
          
          if (exists) {
            const [signedUrl] = await file.getSignedUrl({
              action: 'read',
              expires: Date.now() + 60 * 60 * 1000,
            });
            
            console.log('✅ Generated signed URL:');
            console.log(signedUrl.substring(0, 150) + '...');
            
            // Test if URL is accessible
            console.log('\n🌐 Testing URL accessibility...');
            const https = require('https');
            https.get(signedUrl, (res) => {
              console.log('HTTP Status:', res.statusCode);
              console.log('Content-Type:', res.headers['content-type']);
              console.log('Content-Length:', res.headers['content-length']);
              
              if (res.statusCode === 200) {
                console.log('✅ URL is accessible!');
              } else {
                console.log('❌ URL returned error status');
              }
              
              process.exit(0);
            }).on('error', (err) => {
              console.error('❌ Error accessing URL:', err.message);
              process.exit(1);
            });
          } else {
            console.log('❌ File does not exist in storage');
            process.exit(1);
          }
        } catch (storageError) {
          console.error('❌ Storage error:', storageError.message);
          console.error(storageError);
          process.exit(1);
        }
      } else {
        console.log('❌ No storageUri found');
        process.exit(1);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testIdentityDocuments();
