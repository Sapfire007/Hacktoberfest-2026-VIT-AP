/**
 * Visit Request Service
 *
 * Full workflow: Submit → Review → Approve/Reject → Permit. Every call goes through
 * `Node_Backend` (/api/visits), which decides from the signed-in account who is asking
 * and what they may do.
 *
 * This file used to read and write the `visitRequests` collection directly with the
 * Firebase web SDK. That client was never signed in, so those calls only worked while the
 * database accepted unauthenticated reads and writes — meaning anyone with the app's
 * config could list every request or approve any of them. The exported function names and
 * signatures are unchanged, so the screens did not need to change with it. Parameters that
 * used to say *who* was acting (`userId`, `facultyId`, `cancelledBy`) are now ignored: the
 * server takes that from the token.
 *
 * "Subscriptions" poll the API. Visit requests change a few times a day, so a refresh every
 * 20 seconds is indistinguishable from a live listener for the person looking at the screen.
 */

import { StatusKey } from '@/constants/colors';
import { visitAPI } from '@/services/api.service';
import { firebaseAuth } from '@/services/firebase.auth';

/** How often subscriptions refresh. */
const POLL_INTERVAL_MS = 20000;

/**
 * A timestamp the screens can call `.toDate()` on, as they did with Firestore Timestamps.
 * The API sends ISO strings; wrapping them here meant no screen had to change.
 */
export interface TimestampLike {
  toDate: () => Date;
  seconds: number;
  toISOString: () => string;
}

function toTimestamp(iso: string | null | undefined): TimestampLike | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    toDate: () => new Date(date),
    seconds: Math.floor(date.getTime() / 1000),
    toISOString: () => date.toISOString(),
  };
}

export interface VisitRequestData {
  // Requester Information (set by the server from the signed-in account)
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  requesterCategory: string; // visitor subtype, parent, student
  requesterSubtype?: string;
  requesterPhotoUri?: string | null;

  /**
   * Who will actually come to the gate, and whose name is on the permit. The requester
   * for visitors and parents; the parent or guardian a student is sponsoring.
   */
  visitorName?: string;
  visitorPhone?: string | null;
  visitorRelation?: string | null;
  /** Set when a student requested on someone else's behalf. */
  sponsoredBy?: string | null;

  // Visit Details
  destination: string;
  purpose: string;
  visitType: string; // Meeting, Event, Parent Visit, Delivery, Maintenance
  visitDate: string;
  timeWindow: string;
  startTime?: string;
  endTime?: string;
  /** Machine-readable visit window (ISO). The permit expires at the end of it. */
  visitStartAt?: string | null;
  visitEndAt?: string | null;

  // Faculty/Host Information (set by the server from the faculty directory)
  targetFacultyId: string;
  targetFacultyName: string;
  targetFacultyEmail?: string | null;
  targetFacultyDepartment?: string | null;
  targetFacultyPhotoURL?: string | null;

  // Linked Student (for parents)
  linkedStudentId?: string;
  linkedStudentName?: string | null;
  linkedStudentReg?: string | null;

  // Vehicle Information (optional)
  vehiclePlate?: string | null;
  /** Older name for the plate; still sent by the API so existing screens keep working. */
  vehicleNumber?: string | null;
  vehicleModel?: string | null;
  vehicleType?: string | null;

  // Status & Workflow
  status: StatusKey; // pending, approved, rejected, cancelled
  facultyRemarks?: string | null;
  reviewedAt?: any;
  reviewedBy?: string | null;
  reviewedByName?: string | null;

  // Cancellation Tracking
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: any;

  // Permit (issued by the server on approval)
  permitId?: string | null;
  /** Signed gate-pass token — the string the permit QR code encodes. */
  permitQRPayload?: string | null;
  permitExpiresAt?: any;

  // Gate (set by security; ISO strings). A permit admits once.
  gateEntryId?: string | null;
  checkedInAt?: string | null;
  exitedAt?: string | null;

  // Metadata
  createdAt: any;
  updatedAt: any;
}

export interface VisitRequest extends VisitRequestData {
  id: string;
}

/** What a faculty member sees about the person asking to visit them. */
export interface RequesterSummary {
  profilePhotoUri?: string | null;
  govtIdType?: string | null;
  identityProof?: { idType: string; documentName: string; verified?: boolean } | null;
  biometricEnrolled?: boolean;
}

/**
 * Input for a new request. Identity fields (requester, host name/photo) may still be
 * passed by older callers, but the server ignores them and fills them in itself.
 */
export type VisitRequestInput = Partial<
  Pick<
    VisitRequestData,
    | 'requesterId'
    | 'requesterName'
    | 'requesterEmail'
    | 'requesterPhone'
    | 'requesterCategory'
    | 'targetFacultyName'
    | 'targetFacultyPhotoURL'
    | 'linkedStudentName'
    | 'linkedStudentReg'
    | 'vehiclePlate'
    | 'vehicleNumber'
    | 'vehicleModel'
    | 'vehicleType'
  >
> &
  Pick<
    VisitRequestData,
    'destination' | 'purpose' | 'visitType' | 'visitDate' | 'timeWindow' | 'targetFacultyId'
  > & {
    visitStartAt: string;
    visitEndAt: string;
    /** Required when the requester is a student: the parent or guardian who will visit. */
    sponsoredVisitor?: { name: string; phone: string; relation?: string };
  };

// ---------------------------------------------------------------------------------------

async function token(): Promise<string> {
  const idToken = await firebaseAuth.getIdToken();
  console.log('[visitRequest.service] Got Firebase token:', idToken ? `${idToken.substring(0, 50)}... (length: ${idToken.length})` : 'NULL');
  if (!idToken) throw new Error('You are signed out. Sign in again to continue.');
  return idToken;
}

/** Turn an API failure into an Error whose message can be shown as-is. */
function fail(result: { error?: string; message?: string }, fallback: string): never {
  throw new Error(result.message || result.error || fallback);
}

function fromApi(raw: any): VisitRequest {
  return {
    ...raw,
    vehiclePlate: raw.vehiclePlate ?? raw.vehicleNumber ?? null,
    vehicleNumber: raw.vehicleNumber ?? raw.vehiclePlate ?? null,
    createdAt: toTimestamp(raw.createdAt),
    updatedAt: toTimestamp(raw.updatedAt),
    reviewedAt: toTimestamp(raw.reviewedAt),
    cancelledAt: toTimestamp(raw.cancelledAt),
    permitExpiresAt: toTimestamp(raw.permitExpiresAt),
  } as VisitRequest;
}

/**
 * Poll `load` every POLL_INTERVAL_MS, starting immediately. Errors are logged and the
 * last good data stays on screen, rather than blanking the list on a dropped connection.
 */
function poll(load: () => Promise<VisitRequest[]>, callback: (r: VisitRequest[]) => void) {
  let stopped = false;
  let receivedOnce = false;

  const tick = async () => {
    try {
      const data = await load();
      receivedOnce = true;
      if (!stopped) callback(data);
    } catch (error) {
      console.warn('Visit request refresh failed:', (error as Error).message);
      // First load failed: report an empty list so screens leave their loading state.
      if (!stopped && !receivedOnce) callback([]);
    }
  };

  void tick();
  const timer = setInterval(tick, POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

// ---------------------------------------------------------------------------------------

/**
 * Submit a new visit request. Returns the new request's id.
 */
export async function submitVisitRequest(requestData: VisitRequestInput): Promise<string> {
  const result = await visitAPI.create(await token(), {
    destination: requestData.destination,
    purpose: requestData.purpose,
    visitType: requestData.visitType,
    visitDate: requestData.visitDate,
    timeWindow: requestData.timeWindow,
    visitStartAt: requestData.visitStartAt,
    visitEndAt: requestData.visitEndAt,
    targetFacultyId: requestData.targetFacultyId,
    sponsoredVisitor: requestData.sponsoredVisitor,
    linkedStudentName: requestData.linkedStudentName ?? undefined,
    linkedStudentReg: requestData.linkedStudentReg ?? undefined,
    vehiclePlate: requestData.vehiclePlate || requestData.vehicleNumber || undefined,
    vehicleModel: requestData.vehicleModel ?? undefined,
    vehicleType: requestData.vehicleType ?? undefined,
  });

  if (!result.success || !result.data?.request) fail(result, 'Could not submit the request');
  return result.data.request.id;
}

/** The signed-in user's own requests. `userId` is ignored — the server uses the token. */
export async function getVisitRequestsByUser(_userId?: string): Promise<VisitRequest[]> {
  const result = await visitAPI.mine(await token());
  if (!result.success) fail(result, 'Could not load your requests');
  return (result.data?.requests ?? []).map(fromApi);
}

/** Pending requests addressed to the signed-in faculty member. */
export async function getPendingRequestsByFaculty(_facultyId?: string): Promise<VisitRequest[]> {
  const result = await visitAPI.inbox(await token(), 'pending');
  if (!result.success) fail(result, 'Could not load the inbox');
  return (result.data?.requests ?? []).map(fromApi);
}

/** Every request addressed to the signed-in faculty member (history view). */
export async function getAllRequestsByFaculty(_facultyId?: string): Promise<VisitRequest[]> {
  const idToken = await token();
  console.log('[getAllRequestsByFaculty] Calling inbox with scope=all');
  const result = await visitAPI.inbox(idToken, 'all');
  console.log('[getAllRequestsByFaculty] Result:', {
    success: result.success,
    requestCount: result.data?.requests?.length ?? 0,
  });
  if (!result.success) fail(result, 'Could not load request history');
  return (result.data?.requests ?? []).map(fromApi);
}

export function subscribeToAllFacultyRequests(
  _facultyId: string,
  callback: (requests: VisitRequest[]) => void
): () => void {
  return poll(() => getAllRequestsByFaculty(), callback);
}

export function subscribeToUserRequests(
  _userId: string,
  callback: (requests: VisitRequest[]) => void
): () => void {
  return poll(() => getVisitRequestsByUser(), callback);
}

export function subscribeToPendingFacultyRequests(
  _facultyId: string,
  callback: (requests: VisitRequest[]) => void
): () => void {
  return poll(() => getPendingRequestsByFaculty(), callback);
}

/** Approve (faculty). The server checks the request is addressed to the caller. */
export async function approveVisitRequest(
  requestId: string,
  _facultyId?: string,
  remarks?: string
): Promise<void> {
  const result = await visitAPI.approve(await token(), requestId, remarks);
  if (!result.success) fail(result, 'Could not approve the request');
}

/** Reject (faculty). A reason of at least 5 characters is required. */
export async function rejectVisitRequest(
  requestId: string,
  _facultyId: string | undefined,
  remarks: string
): Promise<void> {
  if (!remarks || remarks.trim().length < 5) {
    throw new Error('Rejection reason is required (min 5 characters)');
  }
  const result = await visitAPI.reject(await token(), requestId, remarks.trim());
  if (!result.success) fail(result, 'Could not reject the request');
}

/** Cancel one's own request. Who cancelled is recorded by the server. */
export async function cancelVisitRequest(
  requestId: string,
  _cancelledBy?: string,
  _cancelledByName?: string
): Promise<void> {
  const result = await visitAPI.cancel(await token(), requestId);
  if (!result.success) fail(result, 'Could not cancel the request');
}

/** One request, if the caller may see it. Null if it doesn't exist or isn't theirs. */
export async function getVisitRequestById(requestId: string): Promise<VisitRequest | null> {
  return (await getVisitRequestDetail(requestId))?.request ?? null;
}

/**
 * One request plus, for the host faculty member, a summary of the requester.
 */
export async function getVisitRequestDetail(
  requestId: string
): Promise<{ request: VisitRequest; requester: RequesterSummary | null } | null> {
  const result = await visitAPI.get(await token(), requestId);

  if (!result.success) {
    if (result.status === 404) return null;
    fail(result, 'Could not load the request');
  }

  return {
    request: fromApi(result.data.request),
    requester: result.data.requester ?? null,
  };
}

/** Poll a single request (detail screens). Calls back with null if it disappears. */
export function subscribeToVisitRequest(
  requestId: string,
  callback: (request: VisitRequest | null) => void
): () => void {
  let stopped = false;

  const tick = async () => {
    try {
      const request = await getVisitRequestById(requestId);
      if (!stopped) callback(request);
    } catch (error) {
      console.warn('Visit request refresh failed:', (error as Error).message);
    }
  };

  void tick();
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * Format timestamp for display ("5m ago", "Sep 30").
 */
export function formatTimestamp(timestamp: any): string {
  if (!timestamp) return 'N/A';

  try {
    let date: Date;

    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'N/A';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return 'N/A';
  }
}
