# Faculty Profile Photos Migration

This guide explains how to merge faculty profile photos from `allfaculty_profile_pictures.json` into the Firestore faculty collection.

## Overview

The migration script reads profile pictures from the JSON file and updates each faculty document in Firestore with their corresponding `photoURL` field.

## Prerequisites

1. **Node.js** (v14 or later)
2. **Firebase Admin SDK** credentials (`serviceAccountKey.json`)
3. **Faculty data already migrated** to Firestore (via `migrate-faculty-to-firestore.js`)

## How It Works

### Photo Mapping

The JSON file contains profile pictures with `employeeId` in floating-point format:
```json
{
  "id": 1285,
  "employeeId": 1.70004,
  "Photo": "https://vitap-backend.s3.ap-south-1.amazonaws.com/Dr_Srinivas_S_70004_0497_2c281fd932.avif"
}
```

The script extracts the 5-digit employee ID (e.g., `70004`) from the float and matches it to the faculty document ID (username) in Firestore.

### Firestore Schema Update

After migration, each faculty document will have:
```typescript
{
  username: "70004",
  name: "Dr. Srinivas S",
  department: "SCOPE",
  // ... other fields
  photoURL: "https://vitap-backend.s3.ap-south-1.amazonaws.com/Dr_Srinivas_S_70004_0497_2c281fd932.avif",
  updatedAt: Timestamp
}
```

## Running the Migration

### Step 1: Ensure Dependencies

```bash
cd Backend/Node_Backend
npm install
```

### Step 2: Verify Firebase Credentials

Ensure `serviceAccountKey.json` exists in `Backend/Node_Backend/`:
```
Backend/Node_Backend/
├── serviceAccountKey.json  ✅
├── scripts/
│   └── merge-faculty-photos.js
└── data/
    └── allfaculty_profile_pictures.json
```

### Step 3: Run the Migration Script

```bash
cd Backend/Node_Backend
node scripts/merge-faculty-photos.js
```

### Expected Output

```
🖼️  Starting faculty photo merge...

📸 Found 592 profile pictures

🗺️  Created photo map with 592 entries

👥 Found 592 faculty records in Firestore

✅ Committed batch of 500 updates
✅ Committed final batch of 92 updates

═══════════════════════════════════════════════════
📊 MERGE SUMMARY
═══════════════════════════════════════════════════
✅ Updated with photos: 592
⚠️  No photo found: 0
❌ Errors: 0
═══════════════════════════════════════════════════

📝 Sample updated records:
   70004 - Dr. Srinivas S - https://vitap-backend.s3.ap-south-1.amazonaws.com/...
   70016 - Dr. Dilipkumar Mohanty - https://vitap-backend.s3.ap-south-1.amazonaws.com/...
   70049 - Dr. Pavan Kumar Y V - https://vitap-backend.s3.ap-south-1.amazonaws.com/...
   70087 - Dr. Sudhakar Ilango - https://vitap-backend.s3.ap-south-1.amazonaws.com/...
   70169 - Dr. Benarji Chakka - https://vitap-backend.s3.ap-south-1.amazonaws.com/...

✨ Photo merge completed successfully!
```

## Verification

### 1. Check Firestore Console

Open Firebase Console → Firestore Database → `faculty` collection

Select any document and verify the `photoURL` field is present with a valid S3 URL.

### 2. Query from Node.js

```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

// Check a specific faculty
const doc = await db.collection('faculty').doc('70004').get();
console.log(doc.data().photoURL);
```

### 3. Check in React Native App

After migration, profile photos should automatically appear in:
- Faculty search picker dropdown
- Visit request forms
- Faculty profiles

## React Native Integration

The app has been updated to display photos in the following components:

### FacultySearchPicker Component
- Shows circular avatar in selected faculty display
- Shows circular avatar in dropdown search results
- Falls back to initials if no photo available

### Faculty Service
- Reads `photoURL` from Firestore
- Falls back to `photoUri` for backward compatibility
- Generates avatar placeholder if no photo exists

## Photo Format

- **Format**: AVIF (optimized for web/mobile)
- **Storage**: AWS S3 (vitap-backend bucket)
- **CDN**: Direct S3 URLs with HTTPS
- **Size**: Optimized for fast loading

## Troubleshooting

### Issue: "No faculty found in Firestore"

**Solution**: First run the faculty data migration:
```bash
node scripts/migrate-faculty-to-firestore.js
```

### Issue: "Many faculty showing 'No photo found'"

**Causes**:
1. Employee ID mismatch (floating-point parsing issue)
2. Missing data in JSON file
3. Username format in Firestore doesn't match extracted ID

**Solution**: Check the console warnings for specific usernames and verify the JSON file.

### Issue: Photos not displaying in React Native app

**Solution**:
1. Verify photoURL field exists in Firestore
2. Check network access to S3 bucket
3. Ensure Image component has proper error handling
4. Check React Native logs for image loading errors

## Performance

- **Batch Operations**: Updates 500 documents per batch for optimal performance
- **Migration Time**: ~30 seconds for 592 faculty members
- **Firestore Writes**: 592 write operations (one per faculty)

## Safety

✅ **Non-destructive**: Only adds `photoURL` field, doesn't modify existing data
✅ **Idempotent**: Can be run multiple times safely
✅ **Batched**: Uses Firestore batch operations for consistency
✅ **Timestamped**: Adds `updatedAt` timestamp for audit trail

## Cost Estimation

- **Firestore Writes**: 592 write operations
- **Firestore Reads**: 592 read operations
- **Estimated Cost**: <$0.01 (within free tier)

## Next Steps

After successful migration:

1. ✅ Verify photos in Firestore Console
2. ✅ Test faculty search picker in React Native app
3. ✅ Test visit request form with faculty photos
4. ✅ Monitor S3 image loading performance
5. Consider implementing photo caching in the app for better performance

## Support

For issues or questions:
1. Check Firebase Console for Firestore write errors
2. Review React Native debugger for image loading errors
3. Verify S3 bucket CORS configuration for cross-origin access
4. Check AWS S3 bucket public access settings

## Rollback

If you need to remove all photoURLs:

```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

const snapshot = await db.collection('faculty').get();
const batch = db.batch();

snapshot.forEach(doc => {
  batch.update(doc.ref, {
    photoURL: admin.firestore.FieldValue.delete()
  });
});

await batch.commit();
console.log('✅ All photoURLs removed');
```

---

**Last Updated**: September 2026
**Script Version**: 1.0
**Migration Count**: 592 faculty members
