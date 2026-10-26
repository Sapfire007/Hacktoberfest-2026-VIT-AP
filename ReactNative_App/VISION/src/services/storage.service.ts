/**
 * Storage Service — Uploads files to Firebase Cloud Storage & Cloud Firestore
 *
 * Handles:
 * 1. Determining exact file size via FileSystem
 * 2. Uploading to Firebase Storage bucket (vision-1caa0.firebasestorage.app)
 * 3. Fallback to Node Backend upload endpoint (/api/auth/upload-id-document)
 * 4. Returning public/authenticated storageUri and calculated fileSize
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { authAPI } from './api.service';

const firebaseConfig = {
  apiKey: 'AIzaSyDuKPsddEYPSaJyWMs8ZWj_zeuey1_uKow',
  authDomain: 'vision-1caa0.firebaseapp.com',
  projectId: 'vision-1caa0',
  storageBucket: 'vision-1caa0.firebasestorage.app',
  messagingSenderId: '348537307647',
  appId: '1:348537307647:android:315dd47deec0e00646a7ca',
};

export interface UploadResult {
  storageUri: string;
  fileSize: number;
  documentName: string;
  mimeType: string;
}

export interface UploadIdentityDocumentParams {
  localUri: string;
  mimeType: string;
  fileName: string;
  idType: string;
  userId: string;
  idToken: string;
}

/**
 * Uploads an identity proof document (Image or PDF) from the local device
 * to Firebase Storage or Cloud Firestore.
 */
export async function uploadIdentityDocument(
  params: UploadIdentityDocumentParams
): Promise<UploadResult> {
  const { localUri, mimeType, fileName, idType, userId, idToken } = params;

  // 1. Calculate exact file size
  let fileSize = 0;
  try {
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists && typeof (fileInfo as any).size === 'number') {
      fileSize = (fileInfo as any).size;
    }
  } catch (err) {
    console.warn('⚠️ Could not determine file size via getInfoAsync:', err);
  }

  // 2. Read local file as Base64 data
  const base64Data = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!fileSize) {
    fileSize = Math.round((base64Data.length * 3) / 4);
  }

  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  // 3. Attempt direct Firebase Client Storage upload
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const storage = getStorage(app);
    const storagePath = `identity_documents/${userId}/${Date.now()}_${cleanName}`;
    const storageRef = ref(storage, storagePath);

    console.log(`☁️ Uploading ${cleanName} (${fileSize} bytes) directly to Firebase Storage...`);
    await uploadString(storageRef, dataUrl, 'data_url', {
      contentType: mimeType,
      customMetadata: {
        idType,
        userId,
      },
    });

    const downloadUrl = await getDownloadURL(storageRef);
    console.log('✅ Firebase Storage upload successful! Download URL:', downloadUrl);

    return {
      storageUri: downloadUrl,
      fileSize,
      documentName: cleanName,
      mimeType,
    };
  } catch (clientStorageErr: any) {
    console.warn(
      '⚠️ Direct client Firebase Storage upload did not complete (' +
        (clientStorageErr?.message || 'unknown') +
        '). Routing via backend cloud upload service...'
    );
  }

  // 4. Fallback to Node Backend Admin Cloud Upload
  const backendRes = await authAPI.uploadIdDocument(idToken, {
    fileData: base64Data,
    fileName: cleanName,
    mimeType,
    idType,
  });

  if (backendRes.success && backendRes.data?.storageUri) {
    console.log('✅ Backend cloud upload successful! storageUri:', backendRes.data.storageUri);
    return {
      storageUri: backendRes.data.storageUri,
      fileSize: backendRes.data.fileSize || fileSize,
      documentName: backendRes.data.documentName || cleanName,
      mimeType: backendRes.data.mimeType || mimeType,
    };
  }

  throw new Error(
    backendRes.error || backendRes.message || 'Failed to upload document to cloud storage'
  );
}
