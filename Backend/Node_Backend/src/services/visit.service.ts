/**
 * Visit Request Service
 *
 * The pre-registered flow (VISION.md §1, stages 2-4): a visitor, parent or student asks to
 * visit a faculty member, that faculty member approves or rejects, and approval issues a
 * signed permit.
 *
 * This replaces client-side Firestore writes. When the app wrote `visitRequests` directly,
 * nothing checked who was writing: any client holding the app's Firebase config could
 * create a request in someone else's name, or set any request's status to `approved`. Here
 * every rule is enforced on the server:
 *
 *   - the requester is whoever the verified token says, not a field in the body;
 *   - only the faculty member a request is addressed to can approve or reject it;
 *   - only the requester can cancel it;
 *   - a request moves pending -> approved | rejected | cancelled, and approved -> cancelled,
 *     never backwards, so an approval cannot be quietly rewritten.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase.admin';
import { issuePass } from '../core/gate-pass';
import { normalizePlate } from '../core/plate';
import { normalizePhone } from '../core/phone';
import { getUserByUid } from './user.service';
import { getFacultyById } from './faculty.service';
import {
  CreateVisitRequestInput,
  PublicFaculty,
  UserRole,
  VisitRequestRecord,
  VisitRequestStatus,
} from '../types';
import { byNewest, withIndexFallback } from '../core/index-fallback';

export const VISITS_COLLECTION =
  process.env.FIRESTORE_COLLECTION_VISIT_REQUESTS || 'visitRequests';

/** Requests further out than this are almost always a mistyped year. */
const MAX_DAYS_AHEAD = 90;
const MIN_VISIT_MINUTES = 30;
const MAX_VISIT_HOURS = 12;

export class VisitRequestError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'VisitRequestError';
  }
}

/** A request as the API returns it: timestamps as ISO strings, plus its id. */
export interface PublicVisitRequest
  extends Omit<
    VisitRequestRecord,
    | 'visitStartAt'
    | 'visitEndAt'
    | 'reviewedAt'
    | 'cancelledAt'
    | 'permitExpiresAt'
    | 'checkedInAt'
    | 'exitedAt'
    | 'createdAt'
    | 'updatedAt'
  > {
  id: string;
  /** Always present here: older records without it fall back to the requester. */
  visitorName: string;
  /** Alias kept for screens that still read the old field name. */
  vehicleNumber: string | null;
  visitStartAt: string | null;
  visitEndAt: string | null;
  reviewedAt: string | null;
  cancelledAt: string | null;
  permitExpiresAt: string | null;
  checkedInAt: string | null;
  exitedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toPublic(id: string, record: VisitRequestRecord): PublicVisitRequest {
  return {
    ...record,
    id,
    visitorName: record.visitorName || record.requesterName,
    vehicleNumber: record.vehiclePlate,
    visitStartAt: toIso(record.visitStartAt),
    visitEndAt: toIso(record.visitEndAt),
    reviewedAt: toIso(record.reviewedAt),
    cancelledAt: toIso(record.cancelledAt),
    permitExpiresAt: toIso(record.permitExpiresAt),
    checkedInAt: toIso(record.checkedInAt),
    exitedAt: toIso(record.exitedAt),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

function cleanText(value: unknown, field: string, { min = 1, max = 500 } = {}): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min) {
    throw new VisitRequestError(`${field} is required`);
  }
  if (text.length > max) {
    throw new VisitRequestError(`${field} is too long (maximum ${max} characters)`);
  }
  return text;
}

function optionalText(value: unknown, max = 100): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
}

function parseWindow(startRaw: unknown, endRaw: unknown): { start: Date; end: Date } {
  const start = new Date(String(startRaw ?? ''));
  const end = new Date(String(endRaw ?? ''));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new VisitRequestError('Choose a visit date and time');
  }

  const minutes = (end.getTime() - start.getTime()) / 60000;

  if (minutes < MIN_VISIT_MINUTES) {
    throw new VisitRequestError(`A visit must be at least ${MIN_VISIT_MINUTES} minutes long`);
  }
  if (minutes > MAX_VISIT_HOURS * 60) {
    throw new VisitRequestError(`A visit cannot be longer than ${MAX_VISIT_HOURS} hours`);
  }
  // A few minutes of grace: the form's "now" and the server's "now" are not the same clock.
  if (end.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new VisitRequestError('That visit time has already passed');
  }
  if (start.getTime() > Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
    throw new VisitRequestError(`Visits can be requested up to ${MAX_DAYS_AHEAD} days ahead`);
  }

  return { start, end };
}

/**
 * Create a request. The requester's identity comes from their profile, the host's from the
 * faculty collection — the body only chooses *which* faculty and *what* visit.
 */
async function createVisitRequest(
  input: CreateVisitRequestInput,
  requester: { uid: string; role: UserRole; email?: string }
): Promise<PublicVisitRequest> {
  const destination = cleanText(input.destination, 'Destination', { max: 200 });
  const purpose = cleanText(input.purpose, 'Purpose', { min: 3, max: 500 });
  const visitType = cleanText(input.visitType, 'Visit type', { max: 50 });
  const visitDate = cleanText(input.visitDate, 'Visit date', { max: 50 });
  const timeWindow = cleanText(input.timeWindow, 'Time window', { max: 50 });
  const { start, end } = parseWindow(input.visitStartAt, input.visitEndAt);

  const faculty: PublicFaculty | null = await getFacultyById(String(input.targetFacultyId || ''));
  if (!faculty || faculty.status !== 'active') {
    throw new VisitRequestError('Choose a faculty member to visit');
  }

  const profile = await getUserByUid(requester.uid);
  if (!profile) {
    throw new VisitRequestError('Complete your profile before requesting a visit', 403);
  }

  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    profile.displayName ||
    (profile.email || requester.email || '').split('@')[0] ||
    'Visitor';

  const plate = input.vehiclePlate ? normalizePlate(input.vehiclePlate) : '';

  // Who will actually come to the gate. Students are not gate-tracked (VISION.md §3.4):
  // they request on behalf of a parent or guardian, and the permit carries that person's
  // name, not the student's.
  let visitor: { name: string; phone: string | null; relation: string | null };
  if (requester.role === 'student') {
    const sponsored = input.sponsoredVisitor;
    const name = typeof sponsored?.name === 'string' ? sponsored.name.trim() : '';
    if (name.length < 2) {
      throw new VisitRequestError('Enter the name of the parent or guardian who will visit');
    }
    const phone = normalizePhone(String(sponsored?.phone ?? ''));
    if (phone.length !== 10) {
      throw new VisitRequestError('Enter a valid 10-digit mobile number for the visitor');
    }
    visitor = {
      name: name.slice(0, 100),
      phone,
      relation: optionalText(sponsored?.relation, 40),
    };
  } else {
    visitor = { name: fullName, phone: profile.phone || null, relation: null };
  }

  const record: VisitRequestRecord = {
    requesterId: requester.uid,
    requesterName: fullName,
    requesterEmail: profile.email || requester.email || '',
    requesterPhone: profile.phone || '',
    requesterRole: requester.role,
    requesterCategory:
      requester.role === 'visitor' ? profile.visitorSubtype || 'general' : requester.role,
    requesterPhotoUri: (profile as any).profilePhotoUri || profile.photoURL || null,

    visitorName: visitor.name,
    visitorPhone: visitor.phone,
    visitorRelation: visitor.relation,
    sponsoredBy: requester.role === 'student' ? requester.uid : null,

    destination,
    purpose,
    visitType,
    visitDate,
    timeWindow,
    visitStartAt: Timestamp.fromDate(start),
    visitEndAt: Timestamp.fromDate(end),

    targetFacultyId: faculty.id,
    targetFacultyName: faculty.name,
    targetFacultyEmail: faculty.email || null,
    targetFacultyDepartment: faculty.department || null,
    targetFacultyPhotoURL: faculty.photoURL,

    linkedStudentName: optionalText(input.linkedStudentName),
    linkedStudentReg: optionalText(input.linkedStudentReg, 30),

    vehiclePlate: plate.length >= 4 ? plate : null,
    vehicleModel: optionalText(input.vehicleModel),
    vehicleType: optionalText(input.vehicleType, 30),

    status: 'pending',
    facultyRemarks: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewedByName: null,
    cancelledBy: null,
    cancelledByName: null,
    cancelledAt: null,

    permitId: null,
    permitQRPayload: null,
    permitExpiresAt: null,

    gateEntryId: null,
    checkedInAt: null,
    checkedInBy: null,
    exitedAt: null,

    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = getFirestore().collection(VISITS_COLLECTION).doc();
  await ref.set(record);

  const now = new Date();
  return toPublic(ref.id, { ...record, createdAt: now, updatedAt: now });
}

async function getVisitRequest(id: string): Promise<PublicVisitRequest | null> {
  if (!id || id.includes('/')) return null;
  const doc = await getFirestore().collection(VISITS_COLLECTION).doc(id).get();
  return doc.exists ? toPublic(doc.id, doc.data() as VisitRequestRecord) : null;
}

/** Newest first, ordered by Firestore once the composite index exists, sorted here until then. */
async function newestRequests(
  label: string,
  query: FirebaseFirestore.Query,
  limit: number
): Promise<PublicVisitRequest[]> {
  const cap = Math.max(1, Math.min(limit, 200));
  const docs = await withIndexFallback(
    label,
    async () => (await query.orderBy('createdAt', 'desc').limit(cap).get()).docs,
    async () =>
      (await query.limit(1000).get()).docs
        .sort(byNewest((doc) => doc.data().createdAt))
        .slice(0, cap)
  );
  return docs.map((doc) => toPublic(doc.id, doc.data() as VisitRequestRecord));
}

async function listByRequester(uid: string, limit = 100): Promise<PublicVisitRequest[]> {
  return newestRequests(
    'visitRequests: requesterId + createdAt',
    getFirestore().collection(VISITS_COLLECTION).where('requesterId', '==', uid),
    limit
  );
}

async function listForFaculty(
  facultyId: string,
  scope: 'pending' | 'all',
  limit = 100
): Promise<PublicVisitRequest[]> {
  let query = getFirestore()
    .collection(VISITS_COLLECTION)
    .where('targetFacultyId', '==', facultyId);

  if (scope === 'pending') {
    query = query.where('status', '==', 'pending');
  }

  return newestRequests(
    scope === 'pending'
      ? 'visitRequests: targetFacultyId + status + createdAt'
      : 'visitRequests: targetFacultyId + createdAt',
    query,
    limit
  );
}

/**
 * Move a request to a new status inside a transaction.
 *
 * The transaction is what makes "approve" and "cancel" safe to race: if a visitor cancels
 * while the faculty member is approving, exactly one of them wins and the other is told
 * the request has already changed, instead of both writes landing.
 */
async function transition(
  id: string,
  allowedFrom: VisitRequestStatus[],
  authorise: (record: VisitRequestRecord) => void,
  build: (record: VisitRequestRecord) => Partial<VisitRequestRecord>
): Promise<PublicVisitRequest> {
  const db = getFirestore();
  const ref = db.collection(VISITS_COLLECTION).doc(id);

  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new VisitRequestError('Request not found', 404);

    const record = snap.data() as VisitRequestRecord;
    authorise(record);

    if (!allowedFrom.includes(record.status)) {
      throw new VisitRequestError(`This request is already ${record.status}`, 409);
    }

    const changes = { ...build(record), updatedAt: FieldValue.serverTimestamp() };
    tx.update(ref, changes);
    return { ...record, ...changes } as VisitRequestRecord;
  });

  // Server timestamps written in this transaction have not resolved yet; stand in "now"
  // for those only, keeping earlier values (an approval time survives a later cancel).
  const now = new Date();
  const resolved = (value: unknown) => (value instanceof FieldValue ? now : value);
  return toPublic(id, {
    ...updated,
    updatedAt: now,
    reviewedAt: resolved(updated.reviewedAt) as Date | null,
    cancelledAt: resolved(updated.cancelledAt) as Date | null,
  });
}

function assertHost(record: VisitRequestRecord, faculty: PublicFaculty): void {
  if (record.targetFacultyId !== faculty.id) {
    // 404, not 403: a faculty member probing ids should not learn which ones exist.
    throw new VisitRequestError('Request not found', 404);
  }
}

/**
 * Approve, and issue the permit.
 *
 * The permit is a signed gate-pass token (core/gate-pass, VISION.md ADR-007), the same
 * format the security gate issues, valid until the end of the approved visit window. The
 * previous permit payload was the string `VISION-PERMIT-<id>-VITAP`, which anyone could
 * type into a QR generator.
 */
async function approveVisitRequest(
  id: string,
  faculty: PublicFaculty,
  remarks?: string
): Promise<PublicVisitRequest> {
  return transition(
    id,
    ['pending'],
    (record) => assertHost(record, faculty),
    (record) => {
      const permitId = `PRM-${id.slice(0, 8).toUpperCase()}`;
      const end =
        record.visitEndAt instanceof Timestamp
          ? record.visitEndAt.toDate()
          : new Date(Date.now() + 12 * 60 * 60 * 1000);

      // A permit that expired before approval would be useless; give it at least an hour.
      const expiresAt = new Date(Math.max(end.getTime(), Date.now() + 60 * 60 * 1000));

      return {
        status: 'approved' as const,
        facultyRemarks: optionalText(remarks, 500) || 'Approved by faculty host.',
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: faculty.id,
        reviewedByName: faculty.name,
        permitId,
        permitQRPayload: issuePass({
          entryId: id,
          passCode: permitId,
          visitorName: record.visitorName || record.requesterName,
          partySize: 1,
          plate: record.vehiclePlate,
          expiresAt,
          kind: 'permit',
        }),
        permitExpiresAt: Timestamp.fromDate(expiresAt),
      };
    }
  );
}

async function rejectVisitRequest(
  id: string,
  faculty: PublicFaculty,
  remarks: string
): Promise<PublicVisitRequest> {
  const reason = typeof remarks === 'string' ? remarks.trim() : '';
  if (reason.length < 5) {
    throw new VisitRequestError('Give a reason for the rejection (at least 5 characters)');
  }

  return transition(
    id,
    ['pending'],
    (record) => assertHost(record, faculty),
    () => ({
      status: 'rejected' as const,
      facultyRemarks: reason.slice(0, 500),
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: faculty.id,
      reviewedByName: faculty.name,
    })
  );
}

/**
 * Cancel one's own request. Allowed while pending, and after approval — plans change —
 * which also withdraws the permit so the QR stops being shown.
 */
async function cancelVisitRequest(
  id: string,
  requester: { uid: string; name?: string }
): Promise<PublicVisitRequest> {
  return transition(
    id,
    ['pending', 'approved'],
    (record) => {
      if (record.requesterId !== requester.uid) {
        throw new VisitRequestError('Request not found', 404);
      }
      if (record.gateEntryId) {
        throw new VisitRequestError('This visit has already been checked in at the gate', 409);
      }
    },
    (record) => ({
      status: 'cancelled' as const,
      cancelledBy: requester.uid,
      cancelledByName: requester.name || record.requesterName,
      cancelledAt: FieldValue.serverTimestamp(),
      permitQRPayload: null,
    })
  );
}

/**
 * What a faculty member may see about the person asking to visit them: enough to decide,
 * nothing more. The ID document itself is not included — its type and whether it was
 * verified are what an approval needs.
 */
async function getRequesterSummary(uid: string) {
  const profile = await getUserByUid(uid);
  if (!profile) return null;

  return {
    profilePhotoUri: (profile as any).profilePhotoUri || profile.photoURL || null,
    govtIdType: profile.identityProof?.idType || (profile as any).govtIdType || null,
    identityProof: profile.identityProof
      ? {
          idType: profile.identityProof.idType,
          documentName: profile.identityProof.documentName,
          verified: Boolean((profile.identityProof as any).verified),
        }
      : null,
    biometricEnrolled: Boolean((profile as any).biometricEnrolled),
  };
}

export {
  toPublic as toPublicVisitRequest,
  createVisitRequest,
  getVisitRequest,
  listByRequester,
  listForFaculty,
  approveVisitRequest,
  rejectVisitRequest,
  cancelVisitRequest,
  getRequesterSummary,
};
