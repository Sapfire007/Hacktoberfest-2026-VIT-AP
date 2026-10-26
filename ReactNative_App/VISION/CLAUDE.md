# VISION — React Native App

**Read `../../VISION.md` first.** It is the project's source of truth: what VISION is, the
canonical role and authentication model, the decision log, the as-built architecture, and
what actually works today versus what is only specified.

## Before writing any app code

**Expo has changed.** Read the exact versioned documentation at
<https://docs.expo.dev/versions/v57.0.0/> before writing code. Patterns from older SDKs, and
most general search results, are wrong for this version.

## Facts about this app

- **Expo SDK 57 · React Native 0.86 · expo-router** (file-based routing, no react-navigation).
- **A development build is required.** This app declares native-only config plugins and
  cannot run in Expo Go — see `VISION.md` ADR-005. Run `npx expo run:android`.
- **All identity and data operations go through `Node_Backend`.** The app holds a Firebase
  session for token minting only; it never writes to Firestore directly.
- **Anything prefixed `EXPO_PUBLIC_` ships inside the bundle** and is readable by anyone who
  installs the app. No secrets there, ever.

## Documentation

Do not add new markdown files here. Requirements go in `../../PRD.md`, screens and the data
model in `../../Design.md`, decisions and architecture in `../../VISION.md`, and dated
changes in `../../progress-tracker.md`. See `VISION.md` §8 for why.


## Verifying Uploaded Identity Documents in Firebase

### Overview
Identity documents (Aadhar, PAN, Passport, etc.) are uploaded and stored in **Cloud Firestore** as base64-encoded data. This approach works on the **free Spark plan** without requiring Firebase Storage (Blaze plan).

### Upload Flow
1. **Frontend** (`identity-details.tsx`):
   - User selects/captures document
   - Converts file to base64
   - Calls `authAPI.uploadIdDocument()` with base64 data
   - Receives `storageUri` (Firestore reference) and `fileSize`
   - Saves user details with both `documentUri` (local) and `storageUri` (cloud)

2. **Backend** (`auth.routes.ts` → `/upload-id-document`):
   - Receives base64 file data
   - Attempts Firebase Storage upload (if Blaze plan active)
   - **Falls back to Firestore** (free tier): Stores base64 in `users/{userId}/identityProof/dataUri`
   - Returns reference: `firestore://users/{userId}/identityProof/dataUri`

### How It Works (Free Tier)

Documents are stored directly in the user's Firestore document as base64 strings. No Storage bucket required.

**Firestore Structure:**
```json
{
  "users/{userId}": {
    "identityProof": {
      "idType": "Aadhar Card",
      "fileName": "aadhar_card_camera.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 245680,
      "dataUri": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA...", // ✅ Full file
      "uploadedAt": "2025-01-15T10:30:00.000Z"
    },
    "govtIdUploaded": true
  }
}
```

### How to View Uploaded Documents

#### Firebase Console (Easiest)

1. Go to Firestore Console: https://console.firebase.google.com/project/vision-1caa0/firestore
2. Navigate to: `users` collection → `{userId}` document
3. Find `identityProof` map → `dataUri` field
4. The value contains a **data URI** (base64-encoded image/PDF)
5. Copy the entire `dataUri` value and paste into browser address bar to view

**Example dataUri:**
```
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcU...
```

#### View in Browser

**Method 1: Direct Paste**
- Copy the full `dataUri` value from Firestore
- Paste into browser address bar
- Press Enter to view image/PDF

**Method 2: HTML Viewer**
Create a simple HTML file:
```html
<!DOCTYPE html>
<html>
<body>
  <img src="PASTE_DATA_URI_HERE" style="max-width: 100%;" />
</body>
</html>
```

**Method 3: Backend Script (Easiest)**
Use the provided script to automatically download and view:
```bash
cd Backend/Node_Backend
node scripts/view-document.js <userId>

# Example:
node scripts/view-document.js abc123xyz
```

This script will:
- Fetch the document from Firestore
- Save it as a local file (jpg/png/pdf)
- Automatically open it in your default viewer
- Store in `Backend/Node_Backend/temp/` folder

**Method 4: Backend API (Future)**
Create an endpoint that fetches and serves the document:
```typescript
GET /api/documents/:userId/identity
// Returns the dataUri or decoded binary
```

### Troubleshooting

**Problem: Documents not visible in Firebase Console**
- Check `users/{userId}/identityProof/dataUri` field
- Should contain a base64 string starting with `data:image/jpeg;base64,` or similar
- If missing, document wasn't uploaded successfully

**Problem: `fileSize` is 0**
- File wasn't uploaded, only metadata saved
- Check app logs for upload errors
- Verify network connection during upload
- Re-upload the document

**Problem: Cannot view dataUri in browser**
- Ensure you copied the ENTIRE string (can be very long - 100KB+)
- Try pasting into an HTML `<img>` tag instead
- For PDFs, use `<embed>` or `<iframe>` tag

### Storage Limits (Firestore Free Tier)

**Spark Plan Limits:**
- Maximum document size: **1 MB** (Firestore limit)
- This allows images up to ~750 KB before base64 encoding
- For larger files, compress images or use lower quality
- Total storage: 1 GB free

**Optimization Tips:**
- Compress images before upload (quality: 0.85 works well)
- Store only essential documents
- Upgrade to Blaze plan if you need Firebase Storage for larger files

### Migration to Firebase Storage (Optional)

If you upgrade to **Blaze plan** later:
1. Firebase Storage will be available automatically
2. Backend will detect Storage and use it instead of Firestore
3. New uploads will go to Storage (with public URLs)
4. Old documents remain in Firestore (still accessible)
5. No code changes needed - backend handles both automatically

### Summary
✅ **Files are stored in Cloud Firestore as base64 data**  
✅ **Works on Firebase FREE Spark plan (no billing required)**  
✅ **Documents stored in `users/{userId}/identityProof/dataUri`**  
✅ **View by copying dataUri and pasting in browser**  
✅ **No longer trapped on user's local device**  
✅ **Automatically upgrades to Firebase Storage if Blaze plan enabled**

The one exception is `frontend_startup.md`: the operational runbook for starting and
rebuilding this app, matching the per-service startup files beside each backend. Keep it to
commands and procedures; architecture and decisions stay in `VISION.md`.
