/**
 * Fetch image from Firebase Storage and generate signed URL
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'vision-9ddb7.appspot.com'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function fetchFromStorage() {
  const userId = 'nZU3zTVejbhk5cPFl5i9p4PkeM82';
  
  console.log(`🔍 Fetching identity document from Storage...\n`);

  try {
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData.identityProof || !userData.identityProof.storageUri) {
      console.log('❌ No storageUri found');
      process.exit(1);
    }

    console.log('Storage URI:', userData.identityProof.storageUri);
    
    // Parse storageUri
    let filePath = userData.identityProof.storageUri;
    
    if (filePath.startsWith('firestore://')) {
      filePath = filePath.replace('firestore://', '');
    }
    
    console.log('File path:', filePath);
    console.log('\n📦 Attempting to access file from Firebase Storage...\n');

    const file = bucket.file(filePath);
    
    // Check if exists
    const [exists] = await file.exists();
    console.log('File exists:', exists);
    
    if (!exists) {
      console.log('❌ File not found in storage');
      process.exit(1);
    }

    // Get metadata
    const [metadata] = await file.getMetadata();
    console.log('\n📄 File Metadata:');
    console.log('  Name:', metadata.name);
    console.log('  Size:', metadata.size, 'bytes');
    console.log('  Content-Type:', metadata.contentType);
    console.log('  Created:', metadata.timeCreated);

    // Generate signed URL
    console.log('\n🔗 Generating signed URL...');
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });
    
    console.log('\n✅ Signed URL generated successfully!');
    console.log('\nURL (first 150 chars):');
    console.log(signedUrl.substring(0, 150) + '...\n');

    // Download file and convert to base64 data URI
    console.log('📥 Downloading file to convert to base64...');
    const [fileBuffer] = await file.download();
    
    const base64String = fileBuffer.toString('base64');
    const dataUri = `data:${metadata.contentType};base64,${base64String}`;
    
    console.log('\n✅ Converted to data URI!');
    console.log('Data URI length:', dataUri.length, 'characters');
    console.log('First 100 chars:', dataUri.substring(0, 100) + '...');

    // Save to HTML file for testing
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Identity Document Test</title>
    <style>
        body { 
            font-family: Arial; 
            max-width: 1000px; 
            margin: 50px auto;
            padding: 20px;
        }
        img { 
            max-width: 100%; 
            border: 2px solid #ccc; 
            border-radius: 8px; 
        }
        .info { 
            background: #f0f0f0; 
            padding: 15px; 
            border-radius: 5px; 
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1>Identity Document - Test Display</h1>
    
    <div class="info">
        <strong>User ID:</strong> ${userId}<br>
        <strong>Document Type:</strong> ${userData.identityProof.idType}<br>
        <strong>File Size:</strong> ${userData.identityProof.fileSize} bytes<br>
        <strong>MIME Type:</strong> ${metadata.contentType}
    </div>

    <h2>Method 1: Data URI (Direct)</h2>
    <img src="${dataUri}" alt="Identity Document via Data URI">

    <h2>Method 2: Signed URL (Firebase Storage)</h2>
    <img src="${signedUrl}" alt="Identity Document via Signed URL">
    
    <div class="info">
        <strong>Signed URL (expires in 1 hour):</strong><br>
        <code style="word-break: break-all; font-size: 11px;">${signedUrl}</code>
    </div>
</body>
</html>`;

    const outputPath = path.join(__dirname, '..', '..', 'Dry_Test', 'identity-document-test.html');
    fs.writeFileSync(outputPath, htmlContent);
    
    console.log('\n✅ Test HTML file created!');
    console.log('📄 Location:', outputPath);
    console.log('\n👉 Open this file in a browser to verify both methods work.\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  }
  
  process.exit(0);
}

fetchFromStorage();
