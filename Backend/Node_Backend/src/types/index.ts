/**
 * Shared TypeScript Types and Interfaces
 */

import { Request } from 'express';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * User role types
 */
export type UserRole = 'visitor' | 'parent' | 'student' | 'faculty' | 'security' | 'admin';

/**
 * Roles that may be created by self-signup. Everything else is admin-provisioned.
 * The register endpoint clamps to this list regardless of what a client sends.
 */
export const SELF_SIGNUP_ROLES = ['visitor', 'parent', 'student'] as const;
export type SelfSignupRole = (typeof SELF_SIGNUP_ROLES)[number];

/**
 * Roles that authenticate with an employee ID rather than an email address.
 */
export const STAFF_ROLES = ['faculty', 'security', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Requester types (for gate-tracked users)
 */
export type RequesterType = 'visitor' | 'parent_guardian';

/**
 * Visitor subtypes.
 *
 * `external_student` covers students visiting from other institutions. They were once a
 * top-level role; they are a visitor subtype now because they are functionally guests of
 * the campus and need the same gate pipeline as any other guest (see VISION.md section 3.3).
 */
export type VisitorSubtype =
  | 'general'
  | 'alumni'
  | 'vendor'
  | 'guest_faculty'
  | 'external_student';

/**
 * User status
 */
export type UserStatus = 'active' | 'suspended' | 'pending';

/**
 * Permitted Personal Identity Proof Types
 */
export type IdentityProofType =
  | 'Aadhar Card'
  | 'PAN Card'
  | 'Voter ID Card'
  | 'Indian Passport'
  | 'Birth Certificate';

/**
 * Identity Proof metadata stored in Firestore
 */
export interface IdentityProof {
  idType: IdentityProofType;
  documentName: string;
  mimeType: string;
  fileSize?: number;
  documentUri?: string;
  storageUri?: string;
  uploadedAt: string | Timestamp | Date;
}

/**
 * Facial Biometric record stored in Cloud Firestore biometrics collection
 */
export interface BiometricRecord {
  userId: string;
  encryptedEmbedding: string;
  modelName: string;
  detectorBackend: string;
  embeddingDimensions: number;
  facesProcessed: number;
  status: 'active' | 'revoked' | 'archived';
  version: number;
  enrolledAt: Timestamp | Date | FieldValue | string;
  updatedAt: Timestamp | Date | FieldValue | string;
}

/**
 * User Profile Interface (Firestore document)
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: UserRole;
  /** Null for staff roles, which authenticate by employee ID instead. */
  requesterType: RequesterType | null;
  visitorSubtype?: VisitorSubtype | null;
  /** Set only for staff roles. Unique, immutable, and never reissued once deactivated. */
  employeeId?: string | null;
  status: UserStatus;
  emailVerified: boolean;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  identityProof?: IdentityProof | null;
  govtIdUploaded: boolean;
  biometricEnrolled: boolean;
  biometricEnrolledAt?: Timestamp | Date | FieldValue | null;
  biometricModel?: string | null;
  biometricDimensions?: number | null;
  profileComplete: boolean;
  createdAt: Timestamp | Date | FieldValue;
  lastLoginAt: Timestamp | Date | FieldValue;
  updatedAt: Timestamp | Date | FieldValue;
}

/**
 * Staff credential record (Firestore `staff_credentials/{employeeId}`).
 *
 * Deliberately separate from UserProfile and keyed on the employee ID, because sign-in
 * has to find an account from an employee ID before any uid is known. Keeping it separate
 * also means lockout state and password resets never touch the profile document.
 *
 * `passwordHash` never leaves this module's service layer: no endpoint returns it, and it
 * is never written to a log or synced to a gate device.
 */
export interface StaffCredential {
  employeeId: string;
  uid: string;
  passwordHash: string;
  role: StaffRole;
  displayName: string;
  department?: string | null;
  email?: string | null;
  active: boolean;
  /** Forces a password change before the app shell opens (first sign-in, or after a reset). */
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil?: Timestamp | Date | FieldValue | null;
  lastLoginAt?: Timestamp | Date | FieldValue | null;
  provisionedByUid: string;
  createdAt: Timestamp | Date | FieldValue;
  updatedAt: Timestamp | Date | FieldValue;
}

/**
 * The claims this service attaches to a Firebase user.
 *
 * These are written only by the server and read back out of the verified token, which is
 * what makes them safe to authorize against — unlike a role in a request body.
 */
export interface VisionClaims {
  role: UserRole;
  employeeId?: string;
}

/**
 * Decoded Firebase Token (from Firebase Admin SDK)
 */
export interface DecodedToken {
  uid: string;
  email: string;
  email_verified: boolean;
  /** Custom claim written by this service. Absent on a token minted before the role was set. */
  role?: UserRole;
  /** Custom claim, staff accounts only. */
  employeeId?: string;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
  sub: string;
}

/**
 * User data for registration
 */
export interface RegisterUserData {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string | null;
  emailVerified?: boolean;
  /** Only a self-signup role is accepted here; staff accounts are provisioned separately. */
  role?: SelfSignupRole;
  requesterType?: RequesterType | null;
  visitorSubtype?: VisitorSubtype | null;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  phone?: string;
  identityProof?: IdentityProof;
}

/**
 * Extended Express Request with authenticated user
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    emailVerified: boolean;
    name?: string;
    picture?: string;
    /**
     * Read from the verified token's custom claim, never from the request body.
     * Undefined means the account has no role claim yet (it has authenticated but not
     * registered), which every role check treats as "not authorized".
     */
     role?: UserRole;
    employeeId?: string;
  };
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: any[];
}

/**
 * Pagination response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  lastDocId?: string | null;
}

// =========================================
// Gate entries — walk-in visitor registration by security
// =========================================

/**
 * A walk-in visitor registered at the gate by a security officer.
 *
 * This is deliberately NOT a `UserProfile`. A walk-in has no account, no password and no
 * enrolled biometric — the officer is vouching for a person standing in front of them,
 * using a government ID they physically inspected. Modelling it as a user would put a
 * credential-less record into the authentication collection and make "is this person
 * signed in" meaningless. The record's whole life is one visit.
 */
export type GateEntryStatus = 'on_campus' | 'exited' | 'cancelled';

/** A companion arriving with the primary visitor. Named, but not separately ID-checked. */
export interface GateCompanion {
  name: string;
  /** Free text: "brother", "colleague", "child". Optional — the name is what matters. */
  relation?: string | null;
  /** Rough age, used only to distinguish a minor in the log. Optional. */
  age?: number | null;
}

export interface GateVehicle {
  /**
   * Normalised, spaceless, uppercase — "AP31AB1234". Stored this way so two officers
   * typing "AP 31 AB 1234" and "ap31ab1234" produce the same searchable value.
   */
  plate: string;
  /** As the officer saw it, before normalisation. Kept for the audit trail. */
  plateRaw?: string | null;
  /**
   * How the plate got into the record. `ocr` means the ANPR service read it and the
   * officer accepted it unchanged; `ocr_edited` means it read it and the officer
   * corrected it; `manual` means it was typed. This is the field that tells you whether
   * the ANPR model is actually working in production.
   */
  source: 'manual' | 'ocr' | 'ocr_edited';
  /** Recogniser confidence 0–1, when the plate came from OCR. */
  confidence?: number | null;
  make?: string | null;
  color?: string | null;
}

export interface GateIdProof {
  /** Which document the officer inspected. */
  idType: IdentityProofType | string;
  /**
   * Last four characters only. The full number is never stored: the officer has already
   * verified the document in person, so keeping the number adds identity-theft exposure
   * without adding verification value.
   */
  idLastFour?: string | null;
  /** Firebase Storage path of the photo the officer took. */
  storageUri?: string | null;
  /** Data URI, used only in local development where Storage is not configured. */
  imageDataUri?: string | null;
  capturedAt: Timestamp | Date | FieldValue;
}

export interface GateEntry {
  id: string;
  /** Short human-readable pass code shown on the printed/QR pass, e.g. "VIS-7F4K2A". */
  passCode: string;

  visitorName: string;
  phone: string;
  purpose: string;
  /** Who they are here to see, as free text — walk-ins often cannot name a faculty uid. */
  hostName?: string | null;
  visitorSubtype?: VisitorSubtype | null;

  companions: GateCompanion[];
  /** Primary visitor plus companions. Denormalised so "how many people are on campus". */
  partySize: number;

  vehicle?: GateVehicle | null;
  idProof: GateIdProof;

  status: GateEntryStatus;
  entryAt: Timestamp | Date | FieldValue;
  exitAt?: Timestamp | Date | FieldValue | null;
  /** When the pass stops being valid for exit. Entries are not open-ended. */
  expiresAt: Timestamp | Date | FieldValue;

  gate?: string | null;

  /** Officer who registered the entry. Every record is attributable to a person. */
  registeredByUid: string;
  registeredByEmployeeId: string;
  /** Officer who scanned them out. Null until exit. */
  exitedByUid?: string | null;
  exitedByEmployeeId?: string | null;

  notes?: string | null;

  /**
   * How the visitor got in: registered at the gate (`walkin`), checked in on an approved
   * visit-request permit (`permit`), or on a multi-day pass (`recurring`). Entries written
   * before this field existed are walk-ins.
   */
  source?: 'walkin' | 'permit' | 'recurring';
  /** The visit request a permit check-in came from. */
  visitRequestId?: string | null;
  /** The multi-day pass a recurring check-in came from. */
  recurringPassId?: string | null;

  /** Optional; used to send the pass to the visitor's VISION account. */
  email?: string | null;
  linkedUserUid?: string | null;
  linkedVia?: 'email' | 'phone' | null;
  linkedAccountLabel?: string | null;
  suggestedUserUid?: string | null;
  suggestedAccountLabel?: string | null;

  /** Set when the officer admitted someone matching the watchlist, with their reason. */
  watchlistOverride?: { reason: string; matchIds: string[]; by: string } | null;

  createdAt: Timestamp | Date | FieldValue;
  updatedAt: Timestamp | Date | FieldValue;
}

/** What the app sends to register a walk-in. */
export interface CreateGateEntryInput {
  visitorName: string;
  phone: string;
  /** Optional. Matched to a verified VISION account so the pass appears in their app. */
  email?: string;
  /** Present when the officer admits someone matching the watchlist. */
  watchlistOverride?: { reason: string };
  purpose: string;
  hostName?: string;
  visitorSubtype?: VisitorSubtype;
  companions?: GateCompanion[];
  vehicle?: {
    plate: string;
    plateRaw?: string;
    source?: GateVehicle['source'];
    confidence?: number;
    make?: string;
    color?: string;
  } | null;
  idProof: {
    idType: string;
    idLastFour?: string;
    storageUri?: string;
    imageDataUri?: string;
  };
  gate?: string;
  notes?: string;
  /** Hours the pass stays valid. Clamped server-side. */
  validForHours?: number;
}

/**
 * What the app sends to check a permit holder in. The visitor, host and window all come
 * from the approved request; the officer adds only what they see at the gate.
 */
export interface CheckInPermitInput {
  passToken: string;
  /** The document the officer inspected. Always required — a permit is not an ID. */
  idType: string;
  idLastFour?: string;
  /** Required when the visitor has no ID on file (e.g. a parent sponsored by a student). */
  idImageDataUri?: string;
  vehicle?: CreateGateEntryInput['vehicle'];
  companions?: GateCompanion[];
  gate?: string;
  notes?: string;
  watchlistOverride?: { reason: string };
}

export type RecurringCategory = 'vendor' | 'contractor' | 'driver' | 'mess_staff' | 'other';
export const RECURRING_CATEGORIES: RecurringCategory[] = [
  'vendor',
  'contractor',
  'driver',
  'mess_staff',
  'other',
];

/**
 * A multi-day pass (Firestore `recurring_passes/{id}`) for people who come on a schedule:
 * vendors, contractors, drivers, mess staff. One QR, reused: each day it checks the holder
 * in and out through an ordinary gate entry.
 */
export interface RecurringPassRecord {
  passCode: string;
  holderName: string;
  phone: string;
  email: string | null;
  category: RecurringCategory;
  organisation: string | null;
  purpose: string;
  hostName: string | null;
  vehiclePlate: string | null;

  idType: string;
  idLastFour: string | null;
  idImageDataUri: string | null;

  /** IST calendar dates, inclusive. */
  validFrom: string;
  validUntil: string;
  /** Days of week the pass admits on, 0 = Sunday. */
  weekdays: number[];
  /** IST "HH:MM". */
  dailyStart: string;
  dailyEnd: string;

  status: 'active' | 'revoked';
  /** The gate entry for today's visit while the holder is inside. */
  currentEntryId: string | null;
  lastEntryAt: Timestamp | Date | null;

  issuedByUid: string;
  issuedByEmployeeId: string | null;
  issuedByRole: UserRole | null;
  revokedAt: Timestamp | Date | null;
  revokedByEmployeeId: string | null;
  revokeReason: string | null;

  linkedUserUid: string | null;
  linkedVia: 'email' | 'phone' | null;
  linkedAccountLabel: string | null;
  suggestedUserUid: string | null;
  suggestedAccountLabel: string | null;

  notes: string | null;
  createdAt: Timestamp | Date | FieldValue;
  updatedAt: Timestamp | Date | FieldValue;
}

export interface CreateRecurringPassInput {
  holderName: string;
  phone: string;
  email?: string;
  category: RecurringCategory;
  organisation?: string;
  purpose: string;
  hostName?: string;
  vehiclePlate?: string;
  idType: string;
  idLastFour?: string;
  idImageDataUri?: string;
  validFrom: string;
  validUntil: string;
  weekdays: number[];
  dailyStart: string;
  dailyEnd: string;
  notes?: string;
  gate?: string;
  /** Security issuing at the gate: also check the holder in now. */
  checkInNow?: boolean;
  watchlistOverride?: { reason: string };
}

// =========================================
// Faculty directory and visit requests
// =========================================

/**
 * A faculty member as the rest of the app may see them.
 *
 * Built from the `faculty` collection with an explicit allow-list of fields. That
 * collection also holds `passwordHash`, lockout counters and the auth uid, none of which
 * may leave the server — so faculty documents are never returned whole.
 */
export interface PublicFaculty {
  id: string;
  username: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  employeeId: string;
  isMentor: boolean;
  photoURL: string | null;
  status: string;
}

export type VisitRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/**
 * A visit request (Firestore `visitRequests/{id}`).
 *
 * Field names match what the app's screens already read, so the move from client-side
 * Firestore writes to this API did not require renaming anything on screen. Every
 * identity field — who asked, who approves — is written by the server from verified
 * sources, never copied from the request body.
 */
export interface VisitRequestRecord {
  // Requester, from the verified token and their profile
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  requesterRole: UserRole;
  requesterCategory: string;
  requesterPhotoUri: string | null;

  // The visit
  destination: string;
  purpose: string;
  visitType: string;
  /** Display strings, as the app formats them ("Sep 30, 2026", "10:00 AM - 11:30 AM"). */
  visitDate: string;
  timeWindow: string;
  /** Machine-readable window. Drives the permit's expiry. */
  visitStartAt: Timestamp | Date | null;
  visitEndAt: Timestamp | Date | null;

  // Host, looked up from the faculty collection
  targetFacultyId: string;
  targetFacultyName: string;
  targetFacultyEmail: string | null;
  targetFacultyDepartment: string | null;
  targetFacultyPhotoURL: string | null;

  /**
   * The person who will actually arrive at the gate, and whose name goes on the permit.
   * The requester themselves for visitors and parents; for a student, the parent or
   * guardian they are sponsoring (VISION.md §3.4 — students are not gate-tracked).
   * Absent on requests created before sponsorship existed; read as the requester.
   */
  visitorName?: string;
  visitorPhone?: string | null;
  visitorRelation?: string | null;
  /** The sponsoring student's uid, when a student requested on someone's behalf. */
  sponsoredBy?: string | null;

  // Parent visits
  linkedStudentName: string | null;
  linkedStudentReg: string | null;

  // Vehicle
  vehiclePlate: string | null;
  vehicleModel: string | null;
  vehicleType: string | null;

  // Workflow
  status: VisitRequestStatus;
  facultyRemarks: string | null;
  reviewedAt: Timestamp | Date | FieldValue | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelledAt: Timestamp | Date | FieldValue | null;

  // Permit, issued on approval
  permitId: string | null;
  /** Signed gate-pass token (VISION.md ADR-007) — the string the QR code encodes. */
  permitQRPayload: string | null;
  permitExpiresAt: Timestamp | Date | null;

  // Gate, set when security checks the permit in and out. A permit is used once.
  gateEntryId?: string | null;
  checkedInAt?: Timestamp | Date | null;
  checkedInBy?: string | null;
  exitedAt?: Timestamp | Date | null;

  createdAt: Timestamp | Date | FieldValue;
  updatedAt: Timestamp | Date | FieldValue;
}

/** What the app sends to create a request. Identity fields are deliberately absent. */
export interface CreateVisitRequestInput {
  destination: string;
  purpose: string;
  visitType: string;
  visitDate: string;
  timeWindow: string;
  visitStartAt: string;
  visitEndAt: string;
  targetFacultyId: string;
  /** Required when the requester is a student: the parent or guardian who will visit. */
  sponsoredVisitor?: { name: string; phone: string; relation?: string };
  linkedStudentName?: string;
  linkedStudentReg?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  vehicleType?: string;
}
