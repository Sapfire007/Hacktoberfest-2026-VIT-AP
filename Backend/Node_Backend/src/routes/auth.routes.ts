/**
 * Authentication Routes
 * 
 * Handles user authentication and registration endpoints.
 *
 *   POST /api/auth/register          self-signup (visitor | parent | student only)
 *   POST /api/auth/login             resolve an authenticated caller's profile
 *   POST /api/auth/staff/login       employee ID + password -> custom token
 *   POST /api/auth/staff/password    change own staff password
 *   GET  /api/auth/me                current profile
 *
 * Every route here authenticates from a verified Firebase ID token, except the staff
 * sign-in, which is where a staff session begins and therefore cannot already have one.
 */

import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.middleware';
import { loginLimiter, publicLimiter, userLimiter } from '../middleware/rateLimit.middleware';
import { requireSelfOrRole } from '../middleware/rbac.middleware';
import {
  authenticateStaff,
  changeStaffPassword,
  setRoleClaim,
  getStaffByUid,
  LOCKOUT_MINUTES,
} from '../services/staff.service';
import { getAuth, getStorage, getFirestore } from '../config/firebase.admin';
import { detectFileKind } from '../core/input';
import {
  createOrUpdateUser,
  getUserByUid,
  updateUserIdentityDetails,
  saveBiometricRecord,
  getBiometricRecord,
} from '../services/user.service';
import {
  AuthenticatedRequest,
  ApiResponse,
  SelfSignupRole,
  SELF_SIGNUP_ROLES,
  RequesterType,
  IdentityProofType,
} from '../types';

const router = Router();

/**
 * A 500 response. The cause is logged here; the caller gets it only in development, where
 * it saves a trip to the server console. Elsewhere an internal message - a Firestore path,
 * a library's wording - tells a prober more than it tells the person using the app.
 */
function serverError(res: Response, label: string, error: unknown): void {
  console.error(`${label}:`, error);
  res.status(500).json({
    success: false,
    error: label,
    ...(process.env.NODE_ENV === 'development' && { message: (error as Error)?.message }),
  } as ApiResponse);
}

/** Every password field: long enough to be a passphrase, short enough not to be a payload. */
const MAX_PASSWORD_LENGTH = 128;

/**
 * Email domains allowed to register as a student (STUDENT_EMAIL_DOMAINS, comma-separated).
 * Unset means any address, which is how the project has run so far.
 */
function studentDomains(): string[] {
  return (process.env.STUDENT_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

/**
 * The ID document types the upload accepts, and which family their bytes must belong to.
 * SVG and HTML are absent on purpose: both can carry script, and these files are shown to
 * people later.
 */
const UPLOAD_TYPES: Record<string, 'image' | 'pdf'> = {
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  'application/pdf': 'pdf',
};

/** The profile as stored, minus the embedded copy of the ID document itself. */
function withoutDocumentBytes<T extends Record<string, any>>(user: T): T {
  if (!user?.identityProof || typeof user.identityProof !== 'object') return user;
  const { dataUri: _dataUri, ...identityProof } = user.identityProof;
  return { ...user, identityProof };
}

/**
 * GET /api/auth/session
 * Who the bearer token belongs to, straight from the verified token. Used by the biometric
 * service, which asks this server rather than verifying Firebase tokens itself, so there is
 * still exactly one place a token is checked (VISION.md §3.5).
 */
router.get('/session', authenticateToken, userLimiter, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      uid: req.user!.uid,
      role: req.user!.role ?? null,
      employeeId: req.user!.employeeId ?? null,
    },
  } as ApiResponse);
});

/**
 * POST /api/auth/register
 * Register or login user after Google Sign-In
 * 
 * Body: {
 *   role: 'visitor' | 'parent' | 'student',
 *   requesterType: 'visitor' | 'parent_guardian',
 *   visitorSubtype: 'general' | 'alumni' | 'vendor' | 'guest_faculty' | 'external_student'
 * }
 *
 * Faculty, Security and Admin cannot be created here at any price — they are provisioned
 * by an admin against an employee ID (see admin.routes.ts). A role outside the
 * self-signup set is not an error to argue about with the client; it is simply ignored
 * and the account is created as a visitor.
 */
router.post(
  '/register',
  [
    body('role').optional().isIn(SELF_SIGNUP_ROLES as unknown as string[]),
    body('requesterType').optional().isIn(['visitor', 'parent_guardian']),
    body('visitorSubtype')
      .optional()
      .isIn(['general', 'alumni', 'vendor', 'guest_faculty', 'external_student']),
  ],
  authenticateToken,
  userLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        } as ApiResponse);
        return;
      }

      const { role, requesterType, visitorSubtype } = req.body;

      // Staff are provisioned, never registered. Without this, a staff session - or a
      // deactivated one reached through another sign-in route - could rewrite its own
      // role claim to visitor and carry on under a different identity.
      if (req.user!.employeeId || (await getStaffByUid(req.user!.uid))) {
        res.status(403).json({
          success: false,
          error: 'Staff accounts are not registered here',
          message: 'Sign in with your employee ID instead.',
        } as ApiResponse);
        return;
      }

      // Clamp the requested role to the self-signup set. The client is the one asking,
      // so its answer is a suggestion, not an instruction — this line is what stops a
      // signed-in visitor POSTing `role: 'admin'` and becoming one.
      const safeRole: SelfSignupRole = SELF_SIGNUP_ROLES.includes(role)
        ? (role as SelfSignupRole)
        : 'visitor';

      if (role && role !== safeRole) {
        console.warn(
          `Rejected client-supplied role "${role}" for uid ${req.user!.uid}; using "${safeRole}"`
        );
      }

      // VISION.md §3: students register with their institutional address. Enforced when the
      // institution's domains are configured; the email must still be verified before the
      // account can submit anything (requireVerifiedEmail on POST /api/visits).
      const domains = studentDomains();
      if (safeRole === 'student' && domains.length > 0) {
        const domain = (req.user!.email || '').toLowerCase().split('@')[1] || '';
        if (!domains.includes(domain)) {
          res.status(403).json({
            success: false,
            error: 'Use your institutional email address to register as a student',
          } as ApiResponse);
          return;
        }
      }

      // A student is not gate-tracked and has no requester type; only guests do.
      const safeRequesterType: RequesterType | null =
        safeRole === 'student'
          ? null
          : safeRole === 'parent'
            ? 'parent_guardian'
            : ((requesterType as RequesterType) || 'visitor');

      // User data from authenticated token
      const userData = {
        uid: req.user!.uid,
        email: req.user!.email,
        displayName: req.user!.name,
        photoURL: req.user!.picture,
        emailVerified: req.user!.emailVerified,
        role: safeRole,
        requesterType: safeRequesterType,
        visitorSubtype: safeRole === 'visitor' ? visitorSubtype || 'general' : null,
      };

      // Create or update user in Firestore
      const user = await createOrUpdateUser(userData);

      // Write the role into the account's custom claims. From here on, authorization
      // reads the role out of the verified token rather than out of Firestore or a
      // request body — see rbac.middleware.ts.
      await setRoleClaim(req.user!.uid, safeRole);

      res.status(200).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: user.role,
            requesterType: user.requesterType,
            visitorSubtype: user.visitorSubtype,
            profileComplete: user.profileComplete,
            biometricEnrolled: user.biometricEnrolled,
            govtIdUploaded: user.govtIdUploaded,
          },
        },
      } as ApiResponse);
    } catch (error) {
      serverError(res, 'Registration failed', error);
    }
  }
);

/**
 * POST /api/auth/login
 * Verify user credentials and return profile
 * 
 * Body: {
 *   idToken: string (Firebase ID token)
 * }
 */
router.post(
  '/login',
  [body('idToken').notEmpty().withMessage('ID token is required')],
  authenticateToken,
  userLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        } as ApiResponse);
        return;
      }

      // Get user from Firestore
      const user = await getUserByUid(req.user!.uid);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'Please register first',
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: user.role,
            requesterType: user.requesterType,
            visitorSubtype: user.visitorSubtype,
            profileComplete: user.profileComplete,
            biometricEnrolled: user.biometricEnrolled,
            govtIdUploaded: user.govtIdUploaded,
            status: user.status,
          },
        },
      } as ApiResponse);
    } catch (error) {
      serverError(res, 'Login failed', error);
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user profile
 * Requires authentication
 */
router.get('/me', authenticateToken, userLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await getUserByUid(req.user!.uid);

    if (!user) {
      // Staff accounts live in staff_credentials, not users. Without this fallback a
      // signed-in officer gets a 404 here, and on app relaunch the app cannot learn their
      // role and routes them to the wrong shell.
      const staff = await getStaffByUid(req.user!.uid);

      if (staff && staff.active) {
        res.status(200).json({
          success: true,
          data: {
            user: {
              uid: staff.uid,
              email: staff.email,
              displayName: staff.displayName,
              role: staff.role,
              employeeId: staff.employeeId,
              department: staff.department,
              mustChangePassword: staff.mustChangePassword,
              lastLoginAt: staff.lastLoginAt,
            },
          },
        } as ApiResponse);
        return;
      }

      res.status(404).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: user.role,
          requesterType: user.requesterType,
          visitorSubtype: user.visitorSubtype,
          profileComplete: user.profileComplete,
          biometricEnrolled: user.biometricEnrolled,
          govtIdUploaded: user.govtIdUploaded,
          status: user.status,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        },
      },
    } as ApiResponse);
  } catch (error) {
    serverError(res, 'Failed to get profile', error);
  }
});

// There is deliberately no "is this email registered?" endpoint. One existed, unused by the
// app, and answered that question for anyone - a free list-building tool.

/**
 * POST /api/auth/upload-id-document
 * Uploads government identity proof document directly to Firebase Cloud Storage.
 * Falls back to storing the document in Cloud Firestore if Storage bucket is not yet active.
 * Returns public/authenticated storageUri and calculated fileSize.
 */
router.post(
  '/upload-id-document',
  [
    body('fileData').isString().notEmpty().withMessage('File data is required'),
    body('fileName').isString().trim().notEmpty().withMessage('File name is required'),
    body('mimeType')
      .isString()
      .trim()
      .toLowerCase()
      .isIn(Object.keys(UPLOAD_TYPES))
      .withMessage('Upload a photo (JPEG, PNG, WebP, HEIC) or a PDF of the document'),
    body('idType').optional().isString().isLength({ max: 60 }),
  ],
  authenticateToken,
  userLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        } as ApiResponse);
        return;
      }

      const { fileData, fileName, mimeType, idType } = req.body;
      const uid = req.user!.uid;

      // Extract raw base64 if it has a data URL prefix
      const cleanBase64 = (fileData.includes('base64,') ? fileData.split('base64,')[1] : fileData)
        .replace(/\s/g, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const fileSize = buffer.length;

      // Enforce 1 MB server-side limit
      const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
      if (fileSize > MAX_FILE_SIZE) {
        res.status(413).json({
          success: false,
          error: 'File too large',
          message: `Document size (${(fileSize / (1024 * 1024)).toFixed(2)} MB) exceeds the 1 MB limit.`,
        } as ApiResponse);
        return;
      }

      // The label is the client's claim; the bytes are the evidence. A file is stored only
      // if it really is the kind of document it says it is.
      const detected = detectFileKind(buffer);
      const expected = UPLOAD_TYPES[mimeType];
      const actual = detected === 'pdf' ? 'pdf' : detected ? 'image' : null;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64) || actual !== expected) {
        res.status(400).json({
          success: false,
          error: 'That file is not a readable photo or PDF of the document',
        } as ApiResponse);
        return;
      }

      const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'vision-1caa0.firebasestorage.app';
      const storagePath = `identity_documents/${uid}/${Date.now()}_${cleanName}`;

      let storageUri: string | null = null;

      // 1. Attempt Cloud Storage upload using Firebase Admin SDK
      try {
        const bucket = getStorage().bucket(bucketName);
        const file = bucket.file(storagePath);
        await file.save(buffer, {
          metadata: {
            contentType: mimeType,
            metadata: {
              userId: uid,
              idType: idType || 'unknown',
              originalName: cleanName,
            },
          },
        });

        // Direct viewable URL via Firebase Storage API
        storageUri = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
        console.log(`✅ Uploaded document to Firebase Storage: ${storagePath} (${fileSize} bytes)`);
      } catch (storageError: any) {
        console.warn(`⚠️ Cloud Storage bucket unavailable (${storageError?.message}). Storing document in Cloud Firestore.`);
      }

      // 2. If Cloud Storage bucket is not yet active, save payload in a dedicated
      //    sub-collection.  Firestore has a ~1 048 487-byte limit per string field,
      //    so if the base64 payload exceeds that we split it into fixed-size chunks
      //    stored in child documents.
      if (!storageUri) {
        const db = getFirestore();
        const dataUri = `data:${mimeType};base64,${cleanBase64}`;
        const CHUNK_LIMIT = 800_000; // stay well under the ~1 MB per-field cap

        const docRef = db
          .collection('users')
          .doc(uid)
          .collection('identity_documents')
          .doc('current');

        if (dataUri.length <= CHUNK_LIMIT) {
          // Small enough to fit in a single document
          await docRef.set({
            fileName: cleanName,
            mimeType,
            fileSize,
            idType: idType || 'unknown',
            dataUri,
            chunked: false,
            uploadedAt: new Date().toISOString(),
          });
        } else {
          // Split base64 string across numbered chunk documents
          const chunks: string[] = [];
          for (let offset = 0; offset < dataUri.length; offset += CHUNK_LIMIT) {
            chunks.push(dataUri.slice(offset, offset + CHUNK_LIMIT));
          }

          // Write the metadata header (no dataUri field)
          await docRef.set({
            fileName: cleanName,
            mimeType,
            fileSize,
            idType: idType || 'unknown',
            chunked: true,
            chunkCount: chunks.length,
            uploadedAt: new Date().toISOString(),
          });

          // Write each chunk as a child document
          const batch = db.batch();
          for (let i = 0; i < chunks.length; i++) {
            const chunkRef = docRef.collection('chunks').doc(String(i));
            batch.set(chunkRef, { index: i, data: chunks[i] });
          }
          await batch.commit();
        }

        // Only write lightweight metadata into the user document
        const userRef = db.collection('users').doc(uid);
        await userRef.set({ govtIdUploaded: true }, { merge: true });

        storageUri = `firestore://users/${uid}/identity_documents/current`;
        console.log(`✅ Stored document in Firestore sub-collection (free tier): ${storageUri} (${fileSize} bytes)`);
      }

      res.status(200).json({
        success: true,
        message: 'Document successfully stored in the cloud',
        data: {
          storageUri,
          fileSize,
          documentName: cleanName,
          mimeType,
        },
      } as ApiResponse);
    } catch (error) {
      serverError(res, 'Failed to upload document', error);
    }
  }
);


/**
 * POST /api/auth/profile
 * Update user personal identity details and identity proof in Firestore
 * 
 * Body: {
 *   firstName: string (mandatory),
 *   middleName?: string (optional),
 *   lastName: string (mandatory),
 *   phone: string (mandatory),
 *   identityProof: {
 *     idType: 'Aadhar Card' | 'PAN Card' | 'Voter ID Card' | 'Indian Passport' | 'Birth Certificate',
 *     documentName: string,
 *     mimeType: string,
 *     fileSize?: number,
 *     documentUri?: string,
 *     storageUri?: string
 *   }
 * }
 */
router.post(
  '/profile',
  [
    body('firstName').isString().trim().notEmpty().withMessage('First name is mandatory')
      .isLength({ max: 60 }).withMessage('First name is too long'),
    body('middleName').optional({ values: 'null' }).isString().trim()
      .isLength({ max: 60 }).withMessage('Middle name is too long'),
    body('lastName').isString().trim().notEmpty().withMessage('Last name is mandatory')
      .isLength({ max: 60 }).withMessage('Last name is too long'),
    body('phone').isString().trim().notEmpty().withMessage('Phone number is mandatory')
      .matches(/^[0-9+()\-\s]{6,20}$/).withMessage('Enter a valid phone number'),
    body('identityProof').isObject().withMessage('Identity proof details are mandatory'),
    body('identityProof.idType')
      .isIn(['Aadhar Card', 'PAN Card', 'Voter ID Card', 'Indian Passport', 'Birth Certificate'])
      .withMessage('Valid identity proof type is required'),
    body('identityProof.documentName').optional({ values: 'null' }).isString().isLength({ max: 200 }),
    body('identityProof.mimeType').optional({ values: 'null' }).isString().isLength({ max: 100 }),
    body('identityProof.documentUri').optional({ values: 'null' }).isString().isLength({ max: 1500000 }), // ~1.5 MB for base64 data URI
    body('identityProof.storageUri').optional({ values: 'null' }).isString().isLength({ max: 2048 }),
    body('identityProof.fileSize').optional({ values: 'null' }).isInt({ min: 0 }),
  ],
  authenticateToken,
  userLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        } as ApiResponse);
        return;
      }

      const { firstName, middleName, lastName, phone, identityProof } = req.body;

      const updatedUser = await updateUserIdentityDetails(req.user!.uid, {
        firstName,
        middleName: middleName || null,
        lastName,
        phone,
        identityProof: {
          idType: identityProof.idType as IdentityProofType,
          documentName: identityProof.documentName || 'identity_proof',
          mimeType: identityProof.mimeType || 'application/octet-stream',
          fileSize: Number(identityProof.fileSize) || 0,
          documentUri: identityProof.documentUri || null,
          storageUri: identityProof.storageUri || null,
          uploadedAt: new Date().toISOString(),
        },
      });

      res.status(200).json({
        success: true,
        message: 'Identity details and ID proof saved in Firestore',
        data: {
          // Without the document bytes: the app caches this profile in plain storage, and
          // only ever reads the ID type and document name from it.
          user: withoutDocumentBytes(updatedUser),
        },
      } as ApiResponse);
    } catch (error) {
      serverError(res, 'Failed to update identity profile', error);
    }
  }
);

/**
 * POST /api/auth/biometrics
 * Persist facial biometric vector & DeepFace metadata in Cloud Firestore
 * 
 * Body: {
 *   encryptedEmbedding: string (base64 string of AES-256 encrypted vector),
 *   modelName?: string,
 *   detectorBackend?: string,
 *   embeddingDimensions?: number,
 *   facesProcessed?: number
 * }
 */
router.post(
  '/biometrics',
  [
    body('encryptedEmbedding')
      .isString()
      .notEmpty()
      .withMessage('Encrypted embedding is required')
      // A VGG-Face composite is about 150 KB once encrypted and encoded.
      .isLength({ max: 600_000 })
      .withMessage('Encrypted embedding is too large'),
    body('modelName').optional().isString().isLength({ max: 40 }),
    body('detectorBackend').optional().isString().isLength({ max: 40 }),
    body('embeddingDimensions').optional().isInt({ min: 1, max: 10000 }),
    body('facesProcessed').optional().isInt({ min: 1, max: 10 }),
  ],
  authenticateToken,
  userLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        } as ApiResponse);
        return;
      }

      const {
        encryptedEmbedding,
        modelName,
        detectorBackend,
        embeddingDimensions,
        facesProcessed,
      } = req.body;

      const record = await saveBiometricRecord({
        userId: req.user!.uid,
        encryptedEmbedding,
        modelName: modelName || 'VGG-Face',
        detectorBackend: detectorBackend || 'opencv',
        embeddingDimensions: embeddingDimensions || 4096,
        facesProcessed: facesProcessed || 1,
      });

      res.status(200).json({
        success: true,
        message: 'Biometric embedding and metadata saved to Cloud Firestore',
        data: {
          userId: record.userId,
          modelName: record.modelName,
          detectorBackend: record.detectorBackend,
          embeddingDimensions: record.embeddingDimensions,
          status: record.status,
        },
      } as ApiResponse);
    } catch (error) {
      serverError(res, 'Failed to save biometric data in Firestore', error);
    }
  }
);

/**
 * GET /api/auth/biometrics/:userId
 * Retrieve biometric record from Cloud Firestore (for turnstile gates / security kiosks)
 *
 * Restricted to the record's owner, plus security and admin. Without the guard, any
 * authenticated user could read anyone's face embedding by changing the id in the URL —
 * which is the most sensitive data this system holds.
 */
router.get(
  '/biometrics/:userId',
  authenticateToken,
  userLimiter,
  requireSelfOrRole('userId', 'security', 'admin'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      const record = await getBiometricRecord(userId);

      if (!record) {
        res.status(404).json({
          success: false,
          error: 'Biometric record not found',
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          biometric: record,
        },
      } as ApiResponse);
    } catch (error) {
      serverError(res, 'Failed to retrieve biometric record', error);
    }
  }
);

/**
 * POST /api/auth/staff/login
 *
 * The employee-ID track. This is the one route in the service that accepts a password
 * and the one that is not itself authenticated — it is where a staff session begins, so
 * there is no token to present yet.
 *
 * Body: { employeeId, password }
 * Returns a Firebase custom token, which the app exchanges for a normal session via
 * signInWithCustomToken(). From that point the staff member is indistinguishable from
 * any other caller: one token type, one verification routine (VISION.md ADR-003).
 */
router.post(
  '/staff/login',
  loginLimiter,
  [
    body('employeeId').optional().trim(),
    body('username').optional().trim(),
    body('password')
      .isString()
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ max: MAX_PASSWORD_LENGTH })
      .withMessage('Password is too long'),
    body().custom((value) => {
      if (!value.employeeId && !value.username) {
        throw new Error('Employee ID or username is required');
      }
      return true;
    }),
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() } as ApiResponse);
        return;
      }

      const identifier = (req.body.employeeId || req.body.username || '').toString().trim();
      const password = req.body.password;
      const result = await authenticateStaff(identifier, password);

      if (!result.ok) {
        if (result.reason === 'locked') {
          res.status(423).json({
            success: false,
            error: 'Account locked',
            message: `Too many failed attempts. Try again in about ${LOCKOUT_MINUTES} minutes.`,
            data: { retryAfterSeconds: result.retryAfterSeconds },
          } as ApiResponse);
          return;
        }

        if (result.reason === 'deactivated') {
          // Said plainly, unlike a wrong password: this is not a guessing attack, and
          // letting the person keep retrying a correct password wastes their time.
          res.status(403).json({
            success: false,
            error: 'Account deactivated',
            message: 'This account has been deactivated. Contact your system administrator.',
          } as ApiResponse);
          return;
        }

        // Unknown employee ID and wrong password are deliberately indistinguishable, so
        // this endpoint cannot be used to discover which IDs exist.
        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'Employee ID, username, or password is incorrect',
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Sign-in successful',
        data: {
          customToken: result.customToken,
          user: {
            uid: result.credential.uid,
            employeeId: result.credential.employeeId,
            role: result.credential.role,
            displayName: result.credential.displayName,
            department: result.credential.department,
            mustChangePassword: result.credential.mustChangePassword,
          },
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Staff login error:', error);
      res.status(500).json({
        success: false,
        error: 'Sign-in failed',
      } as ApiResponse);
    }
  }
);

/**
 * POST /api/auth/faculty/login
 * Dedicated faculty login endpoint.
 */
router.post(
  '/faculty/login',
  loginLimiter,
  [
    body('username').optional().trim(),
    body('employeeId').optional().trim(),
    body('password')
      .isString()
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ max: MAX_PASSWORD_LENGTH })
      .withMessage('Password is too long'),
    body().custom((value) => {
      if (!value.username && !value.employeeId) {
        throw new Error('Username or employee ID is required');
      }
      return true;
    }),
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() } as ApiResponse);
        return;
      }

      const identifier = (req.body.username || req.body.employeeId || '').toString().trim();
      const password = req.body.password;
      const result = await authenticateStaff(identifier, password);

      if (!result.ok) {
        if (result.reason === 'locked') {
          res.status(423).json({
            success: false,
            error: 'Account locked',
            message: `Too many failed attempts. Try again in about ${LOCKOUT_MINUTES} minutes.`,
            data: { retryAfterSeconds: result.retryAfterSeconds },
          } as ApiResponse);
          return;
        }

        if (result.reason === 'deactivated') {
          res.status(403).json({
            success: false,
            error: 'Account deactivated',
            message: 'This account has been deactivated. Contact your system administrator.',
          } as ApiResponse);
          return;
        }

        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'Username or password is incorrect',
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Sign-in successful',
        data: {
          customToken: result.customToken,
          user: {
            uid: result.credential.uid,
            employeeId: result.credential.employeeId,
            role: result.credential.role,
            displayName: result.credential.displayName,
            department: result.credential.department,
            mustChangePassword: result.credential.mustChangePassword,
          },
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Faculty login error:', error);
      res.status(500).json({
        success: false,
        error: 'Sign-in failed',
      } as ApiResponse);
    }
  }
);

/**
 * POST /api/auth/staff/password
 * Change one's own staff password. The current password is required, so an unlocked
 * device left unattended cannot be used to lock the real owner out.
 */
router.post(
  '/staff/password',
  [
    body('currentPassword').isString().notEmpty().isLength({ max: MAX_PASSWORD_LENGTH }),
    body('newPassword')
      .isString()
      .isLength({ min: 8, max: MAX_PASSWORD_LENGTH })
      .withMessage('New password must be 8 to 128 characters')
      .custom((value, { req }) => {
        if (value === req.body.currentPassword) {
          throw new Error('Choose a password different from the current one');
        }
        return true;
      }),
  ],
  authenticateToken,
  userLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() } as ApiResponse);
        return;
      }

      // The employee ID comes from the verified token, not the body — a caller must not
      // be able to change someone else's password by naming their ID.
      const employeeId = req.user!.employeeId;
      if (!employeeId) {
        res.status(403).json({
          success: false,
          error: 'Not a staff account',
          message: 'Use the password reset flow for email accounts',
        } as ApiResponse);
        return;
      }

      if (String(req.body.newPassword).trim().toUpperCase() === employeeId.toUpperCase()) {
        res.status(400).json({
          success: false,
          error: 'The password must not be your employee ID',
        } as ApiResponse);
        return;
      }

      const changed = await changeStaffPassword(
        employeeId,
        req.body.currentPassword,
        req.body.newPassword
      );

      if (!changed) {
        res.status(401).json({
          success: false,
          error: 'Current password is incorrect',
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Password changed',
      } as ApiResponse);
    } catch (error) {
      console.error('Staff password change error:', error);
      res.status(500).json({ success: false, error: 'Password change failed' } as ApiResponse);
    }
  }
);

/**
 * POST /api/auth/password/reset
 * Request a password reset link for an email-track account.
 *
 * Always reports success, whether or not the address is registered. A truthful "no such
 * account" here would turn this endpoint into a way to test which addresses exist.
 * Staff have no self-service reset — see PRD.md FR-PROF-07.
 */
router.post(
  '/password/reset',
  publicLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const genericResponse = {
      success: true,
      message: 'If an account exists for that address, a reset link has been sent.',
    } as ApiResponse;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() } as ApiResponse);
        return;
      }

      const link = await getAuth().generatePasswordResetLink(req.body.email);
      // TODO(phase-4): hand `link` to the notification service once it exists. It is never
      // returned to the caller - that would let anyone reset anyone's password. The app
      // uses Firebase's own reset email (sendPasswordResetEmail) in the meantime.
      // Never logged: a reset link is a password for whoever reads the log.
      void link;

      res.status(200).json(genericResponse);
    } catch (error) {
      // Includes "user not found". Swallowed on purpose, for the reason above.
      console.error('Password reset error:', (error as Error).message);
      res.status(200).json(genericResponse);
    }
  }
);

/**
 * GET /api/auth/staff/me
 * The staff-side counterpart to /me: employee ID, role and department for the caller.
 */
router.get(
  '/staff/me',
  authenticateToken,
  userLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const credential = await getStaffByUid(req.user!.uid);
      if (!credential) {
        res.status(404).json({
          success: false,
          error: 'No staff record for this account',
        } as ApiResponse);
        return;
      }
      res.status(200).json({ success: true, data: { staff: credential } } as ApiResponse);
    } catch (error) {
      console.error('Staff profile error:', error);
      res.status(500).json({ success: false, error: 'Failed to load staff profile' } as ApiResponse);
    }
  }
);

export default router;
