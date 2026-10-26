/**
 * Gate Entry Service
 *
 * Everything that happens at the barrier: registering a walk-in, checking in a visit
 * permit or a multi-day pass, signing people out, and knowing who is inside.
 *
 * Walk-ins are the path for someone who turns up without an approved visit: a delivery
 * driver, a parent who came straight from the station, a contractor's crew. The officer
 * inspects a government ID, photographs it, records who is with them and what they arrived
 * in, and the system issues a signed QR pass. The same pass closes the record on the way
 * out, which is what turns a register of arrivals into an accountable "who is on campus
 * right now" (VISION.md section 1, stages 5-7).
 *
 * Every record names the officer who created it, and every entry, exit and denial also
 * lands in the gate log (gate-log.service) in the same write. That is the point of the
 * module: not convenience, but attribution.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { getFirestore } from '../config/firebase.admin';
import { issuePass, generatePassCode, verifyPass } from '../core/gate-pass';
import { normalizePlate, isRecognisedFormat } from '../core/plate';
import { normalizePhone } from '../core/phone';
import { formatIst } from '../core/ist';
import { isImageDataUri, isStorageUri, text } from '../core/input';
import { byNewest, withIndexFallback } from '../core/index-fallback';
import {
  describeWeekdays,
  scheduleRefusal,
  todaysDeadline,
} from '../core/recurring-schedule';
import { VISITS_COLLECTION, getRequesterSummary } from './visit.service';
import { auditIn, recordAudit } from './audit.service';
import { alertIn, eventIn } from './gate-log.service';
import {
  WatchlistMatch,
  WatchlistOverrideInput,
  checkWatchlist,
  screenAtGate,
} from './watchlist.service';
import { findAccountForPass, confirmSuggestedLink } from './account-link.service';
import {
  GateEntry,
  GateEntryStatus,
  CreateGateEntryInput,
  CheckInPermitInput,
  GateCompanion,
  RecurringPassRecord,
  VisitRequestRecord,
} from '../types';

export const ENTRIES_COLLECTION = process.env.FIRESTORE_COLLECTION_GATE_ENTRIES || 'gate_entries';
export const RECURRING_COLLECTION =
  process.env.FIRESTORE_COLLECTION_RECURRING_PASSES || 'recurring_passes';

/** Default pass validity, and the ceiling an officer may extend it to. */
const DEFAULT_VALID_HOURS = 12;
const MAX_VALID_HOURS = 72;

/** A party larger than this is an event, not a visit, and goes through a different process. */
const MAX_COMPANIONS = 20;

const VISITOR_SUBTYPES = ['general', 'alumni', 'vendor', 'guest_faculty', 'external_student'];

export type Officer = { uid: string; employeeId: string };

export interface IssuedGateEntry {
  entry: PublicGateEntry;
  /** The string that goes into the QR code. */
  passToken: string;
}

/** A gate entry as it is returned over the API - timestamps resolved, ID photo stripped. */
export interface PublicGateEntry {
  id: string;
  passCode: string;
  visitorName: string;
  phone: string;
  email: string | null;
  purpose: string;
  hostName: string | null;
  companions: GateCompanion[];
  partySize: number;
  vehicle: GateEntry['vehicle'];
  idProof: {
    idType: string;
    idLastFour: string | null;
    storageUri: string | null;
    capturedAt: Date | null;
    /** Whether a photo exists. The photo itself is only served to admin, and logged. */
    hasPhoto: boolean;
  };
  status: GateEntryStatus;
  entryAt: Date | null;
  exitAt: Date | null;
  expiresAt: Date | null;
  /** Still inside after the pass expired. */
  overstay: boolean;
  overstayMinutes: number;
  gate: string | null;
  registeredByEmployeeId: string;
  exitedByEmployeeId: string | null;
  notes: string | null;
  source: 'walkin' | 'permit' | 'recurring';
  visitRequestId: string | null;
  recurringPassId: string | null;
  /** The account this pass was sent to, masked. */
  linkedAccountLabel: string | null;
  /** An account matched by phone, awaiting the officer's confirmation, masked. */
  suggestedAccountLabel: string | null;
  watchlistOverride: { reason: string; by: string } | null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
}

/**
 * The ID photo is deliberately dropped here. It is the most sensitive field in the record
 * and nothing in the gate app needs it back after capture - the officer has already
 * looked at the document. Retrieval stays behind the admin endpoint, which logs access.
 */
export function toPublic(entry: GateEntry, now: Date = new Date()): PublicGateEntry {
  const expiresAt = toDate(entry.expiresAt);
  const overstay =
    entry.status === 'on_campus' && expiresAt !== null && expiresAt.getTime() < now.getTime();

  return {
    id: entry.id,
    passCode: entry.passCode,
    visitorName: entry.visitorName,
    phone: entry.phone,
    email: entry.email ?? null,
    purpose: entry.purpose,
    hostName: entry.hostName ?? null,
    companions: entry.companions ?? [],
    partySize: entry.partySize,
    vehicle: entry.vehicle ?? null,
    idProof: {
      idType: entry.idProof?.idType ?? 'unknown',
      idLastFour: entry.idProof?.idLastFour ?? null,
      storageUri: entry.idProof?.storageUri ?? null,
      capturedAt: toDate(entry.idProof?.capturedAt),
      hasPhoto: Boolean(entry.idProof?.imageDataUri || entry.idProof?.storageUri),
    },
    status: entry.status,
    entryAt: toDate(entry.entryAt),
    exitAt: toDate(entry.exitAt),
    expiresAt,
    overstay,
    overstayMinutes: overstay ? Math.floor((now.getTime() - expiresAt!.getTime()) / 60000) : 0,
    gate: entry.gate ?? null,
    registeredByEmployeeId: entry.registeredByEmployeeId,
    exitedByEmployeeId: entry.exitedByEmployeeId ?? null,
    notes: entry.notes ?? null,
    source: entry.source ?? 'walkin',
    visitRequestId: entry.visitRequestId ?? null,
    recurringPassId: entry.recurringPassId ?? null,
    linkedAccountLabel: entry.linkedUserUid ? entry.linkedAccountLabel ?? null : null,
    suggestedAccountLabel: entry.linkedUserUid ? null : entry.suggestedAccountLabel ?? null,
    watchlistOverride: entry.watchlistOverride
      ? { reason: entry.watchlistOverride.reason, by: entry.watchlistOverride.by }
      : null,
  };
}

export class GateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateValidationError';
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Optional email: empty is fine, malformed is not. Lower-cased for matching. */
export function cleanEmail(input: unknown): string | null {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!email) return null;
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    throw new GateValidationError('That email address does not look right');
  }
  return email;
}

/**
 * An ID photo from the app: a JPEG, PNG or WebP data URI, checked by its bytes. Anything
 * else is refused rather than stored, because the admin console renders these.
 */
export function cleanIdPhoto(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null;
  if (!isImageDataUri(input)) {
    throw new GateValidationError('The ID photo could not be read. Take the photo again.');
  }
  return input;
}

/** A storage reference, only in the form this backend produces. */
function cleanStorageUri(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null;
  if (!isStorageUri(input)) throw new GateValidationError('The ID photo reference is not valid');
  return input;
}

function cleanIdLastFour(input: unknown): string | null {
  return text(typeof input === 'number' ? String(input) : input, 20).slice(-4) || null;
}

function validateAndClean(input: CreateGateEntryInput) {
  const visitorName = text(input.visitorName, 100);
  if (visitorName.length < 2) {
    throw new GateValidationError('Enter the name of the visitor');
  }

  const phone = normalizePhone(text(input.phone, 30));
  if (phone.length !== 10) {
    throw new GateValidationError('Enter a valid 10-digit mobile number');
  }

  const purpose = text(input.purpose, 300);
  if (purpose.length < 2) {
    throw new GateValidationError('Enter the purpose of the visit');
  }

  const idType = text(input.idProof?.idType, 60);
  if (!idType) {
    throw new GateValidationError('Select which ID document was checked');
  }

  const imageDataUri = cleanIdPhoto(input.idProof?.imageDataUri);
  const storageUri = cleanStorageUri(input.idProof?.storageUri);

  // An entry without an ID photo is a handwritten register with extra steps - the photo
  // is the whole accountability claim, so it is required rather than encouraged.
  if (!storageUri && !imageDataUri) {
    throw new GateValidationError('Capture a photo of the government ID');
  }

  const email = cleanEmail(input.email);
  const companions = cleanCompanions(input.companions);
  const vehicle = cleanVehicle(input.vehicle);

  const requestedHours = Number(input.validForHours ?? DEFAULT_VALID_HOURS);
  const validForHours = Math.min(
    Math.max(Number.isFinite(requestedHours) ? requestedHours : DEFAULT_VALID_HOURS, 1),
    MAX_VALID_HOURS
  );

  return {
    visitorName,
    phone,
    email,
    purpose,
    companions,
    vehicle,
    validForHours,
    idProof: { idType, idLastFour: cleanIdLastFour(input.idProof?.idLastFour), imageDataUri, storageUri },
  };
}

function cleanCompanions(input: GateCompanion[] | undefined): GateCompanion[] {
  const companions: GateCompanion[] = (Array.isArray(input) ? input : [])
    .map((companion) => ({
      name: text(companion?.name, 100),
      relation: text(companion?.relation, 100) || null,
      age:
        typeof companion?.age === 'number' && companion.age > 0 && companion.age <= 120
          ? companion.age
          : null,
    }))
    .filter((companion) => companion.name.length > 0);

  if (companions.length > MAX_COMPANIONS) {
    throw new GateValidationError(
      'A party this large needs an event pass rather than a gate entry'
    );
  }

  return companions;
}

function cleanVehicle(input: CreateGateEntryInput['vehicle'] | undefined): GateEntry['vehicle'] {
  const rawPlate = text(input?.plate, 30);
  if (!rawPlate) return null;

  const plate = normalizePlate(rawPlate);
  if (plate.length < 4) {
    throw new GateValidationError('The number plate looks too short - check and retype it');
  }

  const source = input?.source;
  return {
    plate,
    plateRaw: text(input?.plateRaw, 30) || rawPlate,
    source: source === 'ocr' || source === 'ocr_edited' || source === 'manual' ? source : 'manual',
    confidence:
      typeof input?.confidence === 'number' && Number.isFinite(input.confidence)
        ? input.confidence
        : null,
    make: text(input?.make, 60) || null,
    color: text(input?.color, 30) || null,
  };
}

/**
 * Write the gate-log row, and — when the officer admitted someone on the watchlist — the
 * alert and audit row, all into the batch or transaction that creates the entry.
 */
function recordArrival(
  writer: FirebaseFirestore.WriteBatch | FirebaseFirestore.Transaction,
  entry: GateEntry,
  officer: Officer,
  now: Date,
  watchlist: { matches: WatchlistMatch[]; overrideReason: string | null }
): void {
  const db = getFirestore();
  const flagged = Boolean(watchlist.overrideReason);

  eventIn(writer, db, {
    type: 'entry',
    entryId: entry.id,
    recurringPassId: entry.recurringPassId ?? null,
    visitRequestId: entry.visitRequestId ?? null,
    passCode: entry.passCode,
    visitorName: entry.visitorName,
    phone: entry.phone || null,
    partySize: entry.partySize,
    plate: entry.vehicle?.plate ?? null,
    gate: entry.gate ?? null,
    source: entry.source ?? 'walkin',
    officer,
    flagged,
    note: flagged ? `Watchlist override: ${watchlist.overrideReason}` : null,
    at: now,
  });

  if (flagged) {
    alertIn(writer, db, {
      type: 'watchlist_override',
      visitorName: entry.visitorName,
      phone: entry.phone || null,
      plate: entry.vehicle?.plate ?? null,
      gate: entry.gate ?? null,
      officer,
      matches: watchlist.matches,
      reason: watchlist.overrideReason,
      entryId: entry.id,
    });
    auditIn(writer, db, {
      actor: { uid: officer.uid, employeeId: officer.employeeId },
      action: 'gate.watchlist_override',
      targetType: 'gate_entries',
      targetId: entry.id,
      summary: `Admitted ${entry.visitorName} despite a watchlist flag: ${watchlist.overrideReason}`,
      meta: { matchIds: watchlist.matches.map((m) => m.id) },
    });
  }
}

function overrideField(
  watchlist: { matches: WatchlistMatch[]; overrideReason: string | null },
  officer: Officer
): GateEntry['watchlistOverride'] {
  return watchlist.overrideReason
    ? { reason: watchlist.overrideReason, matchIds: watchlist.matches.map((m) => m.id), by: officer.employeeId }
    : null;
}

/**
 * Register a walk-in and issue their pass.
 *
 * The pass token is minted from the same values that are written to Firestore, in one
 * pass, so a token can never describe an entry that does not exist.
 */
async function registerEntry(input: CreateGateEntryInput, officer: Officer): Promise<IssuedGateEntry> {
  const cleaned = validateAndClean(input);
  const gate = text(input.gate, 60) || null;

  const link = await findAccountForPass({ email: cleaned.email, phone: cleaned.phone });
  const watchlist = await screenAtGate(
    { phone: cleaned.phone, plate: cleaned.vehicle?.plate, userUid: link.linkedUserUid },
    input.watchlistOverride,
    { visitorName: cleaned.visitorName, gate, officer }
  );

  const db = getFirestore();
  const docRef = db.collection(ENTRIES_COLLECTION).doc();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + cleaned.validForHours * 60 * 60 * 1000);
  const passCode = generatePassCode();
  const partySize = cleaned.companions.length + 1;

  const entry: GateEntry = {
    id: docRef.id,
    passCode,
    visitorName: cleaned.visitorName,
    phone: cleaned.phone,
    email: cleaned.email,
    purpose: cleaned.purpose,
    hostName: text(input.hostName, 100) || null,
    visitorSubtype: (VISITOR_SUBTYPES.includes(input.visitorSubtype as string)
      ? input.visitorSubtype
      : null) as GateEntry['visitorSubtype'],
    companions: cleaned.companions,
    partySize,
    vehicle: cleaned.vehicle,
    idProof: {
      ...cleaned.idProof,
      capturedAt: Timestamp.fromDate(now),
    },
    status: 'on_campus',
    entryAt: Timestamp.fromDate(now),
    exitAt: null,
    expiresAt: Timestamp.fromDate(expiresAt),
    gate,
    registeredByUid: officer.uid,
    registeredByEmployeeId: officer.employeeId,
    exitedByUid: null,
    exitedByEmployeeId: null,
    notes: text(input.notes, 500) || null,
    source: 'walkin',
    visitRequestId: null,
    recurringPassId: null,
    ...link,
    watchlistOverride: overrideField(watchlist, officer),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(docRef, entry);
  recordArrival(batch, entry, officer, now, watchlist);
  await batch.commit();

  const passToken = issuePass({
    entryId: docRef.id,
    passCode,
    visitorName: cleaned.visitorName,
    partySize,
    plate: cleaned.vehicle?.plate ?? null,
    issuedAt: now,
    expiresAt,
  });

  // The stored document holds server timestamps that have not resolved locally yet, so
  // the returned copy substitutes the values that were just written.
  return {
    entry: toPublic({ ...entry, createdAt: now, updatedAt: now }, now),
    passToken,
  };
}

async function getEntry(entryId: string): Promise<PublicGateEntry | null> {
  const db = getFirestore();
  const doc = await db.collection(ENTRIES_COLLECTION).doc(entryId).get();
  return doc.exists ? toPublic(doc.data() as GateEntry) : null;
}

/** The ID photo, for admin only. The route logs every call. */
async function getEntryIdPhoto(
  entryId: string
): Promise<{ visitorName: string; imageDataUri: string | null; storageUri: string | null } | null> {
  const doc = await getFirestore().collection(ENTRIES_COLLECTION).doc(entryId).get();
  if (!doc.exists) return null;
  const entry = doc.data() as GateEntry;
  return {
    visitorName: entry.visitorName,
    imageDataUri: entry.idProof?.imageDataUri ?? null,
    storageUri: entry.idProof?.storageUri ?? null,
  };
}

/** The officer confirms that a phone-matched account is the visitor's. */
async function linkEntryToSuggestedAccount(entryId: string, officer: Officer) {
  return confirmSuggestedLink(ENTRIES_COLLECTION, entryId, {
    uid: officer.uid,
    employeeId: officer.employeeId,
  });
}

// =========================================
// Exit
// =========================================

export type ExitResult =
  | { ok: true; entry: PublicGateEntry }
  | { ok: false; reason: 'invalid_pass'; detail: string }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'not_checked_in'; detail: string }
  | { ok: false; reason: 'already_exited'; entry: PublicGateEntry };

const PASS_FAILURE_DETAIL: Record<string, string> = {
  malformed: 'That QR code is not a VISION gate pass',
  unsupported_version: 'This pass was issued by a newer version - update the app',
  bad_signature: 'This pass has been altered or forged. Do not let the vehicle through.',
  expired: 'This pass has expired. Check with the shift supervisor before releasing.',
};

function invalidPass(reason: string): ExitResult {
  return { ok: false, reason: 'invalid_pass', detail: PASS_FAILURE_DETAIL[reason] };
}

/**
 * Sign out one gate entry. Shared by every kind of pass. In the same batch it appends the
 * gate-log row and updates whatever the entry came from: a permit's visit request gets its
 * exit time (the requester's app stops showing the permit), a recurring pass is freed for
 * tomorrow's check-in.
 */
async function exitEntry(entryId: string, officer: Officer): Promise<ExitResult> {
  const db = getFirestore();
  const docRef = db.collection(ENTRIES_COLLECTION).doc(entryId);
  const doc = await docRef.get();

  if (!doc.exists) return { ok: false, reason: 'not_found' };

  const entry = doc.data() as GateEntry;

  // A second scan is usually the officer checking, not a duplicate exit. Reporting it
  // distinctly - with the original exit time - lets the app say "already left at 4:12pm"
  // rather than silently overwriting a timestamp that is part of the audit record.
  if (entry.status === 'exited') {
    return { ok: false, reason: 'already_exited', entry: toPublic(entry) };
  }

  const now = new Date();
  const batch = db.batch();
  batch.update(docRef, {
    status: 'exited' as GateEntryStatus,
    exitAt: Timestamp.fromDate(now),
    exitedByUid: officer.uid,
    exitedByEmployeeId: officer.employeeId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (entry.visitRequestId) {
    batch.update(db.collection(VISITS_COLLECTION).doc(entry.visitRequestId), {
      exitedAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  if (entry.recurringPassId) {
    batch.update(db.collection(RECURRING_COLLECTION).doc(entry.recurringPassId), {
      currentEntryId: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  eventIn(batch, db, {
    type: 'exit',
    entryId: entry.id,
    recurringPassId: entry.recurringPassId ?? null,
    visitRequestId: entry.visitRequestId ?? null,
    passCode: entry.passCode,
    visitorName: entry.visitorName,
    phone: entry.phone || null,
    partySize: entry.partySize,
    plate: entry.vehicle?.plate ?? null,
    gate: entry.gate ?? null,
    source: entry.source ?? 'walkin',
    officer,
    note: null,
    at: now,
  });
  await batch.commit();

  return {
    ok: true,
    entry: toPublic(
      {
        ...entry,
        status: 'exited',
        exitAt: now,
        exitedByUid: officer.uid,
        exitedByEmployeeId: officer.employeeId,
      },
      now
    ),
  };
}

/**
 * Close a visit by scanning the pass.
 *
 * The signature is checked before Firestore is touched. A forged QR therefore never
 * becomes a database read, and - more importantly - the officer gets the same verdict at
 * a gate with no connectivity as at one with it.
 *
 * A walk-in pass names its gate entry directly and must be unexpired. A permit names its
 * visit request, and a recurring pass names itself; each points at the entry created when
 * it was checked in. Their expiry is ignored on the way out: a meeting or a shift that
 * runs over must not strand the visitor at the barrier. An overstay shows up instead as an
 * entry still on campus past its own `expiresAt`.
 */
async function recordExit(passToken: string, officer: Officer): Promise<ExitResult> {
  const verification = verifyPass(passToken, new Date(), { ignoreExpiry: true });
  if (!verification.ok) return invalidPass(verification.reason);

  const { pass } = verification;
  const db = getFirestore();

  if (pass.kind === 'permit') {
    const request = await db.collection(VISITS_COLLECTION).doc(pass.entryId).get();
    if (!request.exists) return { ok: false, reason: 'not_found' };

    const gateEntryId = (request.data() as VisitRequestRecord).gateEntryId;
    if (!gateEntryId) {
      return {
        ok: false,
        reason: 'not_checked_in',
        detail: 'This permit was never checked in at the gate. Scan it at entry first.',
      };
    }
    return exitEntry(gateEntryId, officer);
  }

  if (pass.kind === 'recurring') {
    const recurring = await db.collection(RECURRING_COLLECTION).doc(pass.entryId).get();
    if (!recurring.exists) return { ok: false, reason: 'not_found' };

    const currentEntryId = (recurring.data() as RecurringPassRecord).currentEntryId;
    if (!currentEntryId) {
      return {
        ok: false,
        reason: 'not_checked_in',
        detail: 'This regular pass is not checked in right now. Scan it at entry first.',
      };
    }
    return exitEntry(currentEntryId, officer);
  }

  if (pass.expiresAt.getTime() <= Date.now()) return invalidPass('expired');
  return exitEntry(pass.entryId, officer);
}

// =========================================
// Denial
// =========================================

/**
 * The officer turned someone away after a watchlist alert. The matches are looked up
 * again here rather than taken from the app, so the log records what the server knows.
 */
async function recordDenial(
  input: { visitorName?: string; phone?: string; plate?: string; gate?: string; reason?: string; source?: string },
  officer: Officer
): Promise<void> {
  const visitorName = text(input.visitorName, 100) || 'Unknown';
  const phone = text(input.phone, 30) ? normalizePhone(text(input.phone, 30)) : null;
  const plate = text(input.plate, 30) ? normalizePlate(text(input.plate, 30)) : null;
  const gate = text(input.gate, 60) || null;
  const reason = text(input.reason, 500) || 'Denied after a watchlist alert';
  const matches = await checkWatchlist({ phone, plate });

  const db = getFirestore();
  const now = new Date();
  const batch = db.batch();

  eventIn(batch, db, {
    type: 'denied',
    entryId: null,
    passCode: null,
    visitorName,
    phone,
    partySize: 1,
    plate,
    gate,
    source: (['walkin', 'permit', 'recurring'].includes(input.source || '') ? input.source : null) as
      | 'walkin'
      | 'permit'
      | 'recurring'
      | null,
    officer,
    flagged: matches.length > 0,
    note: reason,
    at: now,
  });
  alertIn(batch, db, {
    type: 'watchlist_denied',
    visitorName,
    phone,
    plate,
    gate,
    officer,
    matches,
    reason,
  });
  auditIn(batch, db, {
    actor: { uid: officer.uid, employeeId: officer.employeeId },
    action: 'gate.watchlist_denied',
    targetType: 'gate',
    targetId: phone || plate || visitorName,
    summary: `Denied entry to ${visitorName}: ${reason}`,
    meta: { matchIds: matches.map((m) => m.id) },
  });

  await batch.commit();
}

// =========================================
// Permit check-in
// =========================================

/** How early before the approved window a permit holder may enter. */
const EARLY_ARRIVAL_MINUTES = 30;
/** How long after the approved window ends a checked-in visit counts as an overstay. */
const PERMIT_EXIT_GRACE_HOURS = 2;

/** Everything the officer needs to decide whether the person in front of them is the visitor. */
export interface PermitPreview {
  requestId: string;
  permitId: string;
  visitor: {
    name: string;
    phone: string | null;
    /** e.g. "Father", for a parent sponsored by a student. */
    relation: string | null;
    /** The student who requested on the visitor's behalf, if any. */
    sponsorName: string | null;
    /** The requester's own profile photo. Null for a sponsored visitor, who has no account. */
    photoUri: string | null;
    /** The ID document type the visitor registered with, if any. */
    idTypeOnFile: string | null;
    idVerified: boolean;
  };
  /** No ID on file: the officer must photograph the document they inspect. */
  idPhotoRequired: boolean;
  host: { name: string; department: string | null };
  destination: string;
  purpose: string;
  visitStartAt: Date | null;
  visitEndAt: Date | null;
  plate: string | null;
  /** Active watchlist flags matching this visitor — shown before the officer confirms. */
  watchlist: WatchlistMatch[];
}

export type PermitRefusalReason =
  | 'not_found'
  | 'not_approved'
  | 'too_early'
  | 'window_over'
  | 'already_checked_in';

/** A pass that is authentic but cannot be used right now. Reported, not an HTTP error. */
export class PermitRefusedError extends Error {
  constructor(public reason: string, message: string) {
    super(message);
    this.name = 'PermitRefusedError';
  }
}

/**
 * Why this permit cannot admit anyone right now, or null if it can. Pure, so the preview
 * and the check-in transaction apply exactly the same rules.
 */
function permitRefusal(
  record: VisitRequestRecord,
  now: Date
): { reason: PermitRefusalReason; detail: string } | null {
  if (record.status !== 'approved') {
    return {
      reason: 'not_approved',
      detail:
        record.status === 'cancelled'
          ? 'This visit was cancelled. Do not admit on this permit.'
          : `This request is ${record.status}, not approved. Do not admit on this permit.`,
    };
  }

  if (record.gateEntryId) {
    return {
      reason: 'already_checked_in',
      detail: 'This permit has already been used to enter. A permit admits once.',
    };
  }

  const start = toDate(record.visitStartAt);
  const end = toDate(record.visitEndAt);

  if (start && now.getTime() < start.getTime() - EARLY_ARRIVAL_MINUTES * 60 * 1000) {
    return {
      reason: 'too_early',
      detail: `This visit starts at ${formatIst(start)}. Entry opens ${EARLY_ARRIVAL_MINUTES} minutes before.`,
    };
  }

  if (end && now.getTime() > end.getTime()) {
    return {
      reason: 'window_over',
      detail: `This visit window ended at ${formatIst(end)}. The visitor needs a new request or a walk-in registration.`,
    };
  }

  return null;
}

function permitSubject(record: VisitRequestRecord, plate?: string | null) {
  return {
    phone: record.visitorPhone || record.requesterPhone || null,
    plate: plate !== undefined ? plate : record.vehiclePlate,
    // A sponsored parent is not the account holder, so the account flag does not apply.
    userUid: record.sponsoredBy ? null : record.requesterId,
  };
}

async function buildPreview(id: string, record: VisitRequestRecord): Promise<PermitPreview> {
  const sponsored = Boolean(record.sponsoredBy);
  // A sponsored parent has no account, so nothing on file; the requester is the student.
  const summary = sponsored ? null : await getRequesterSummary(record.requesterId);
  const idTypeOnFile = summary?.identityProof?.idType || summary?.govtIdType || null;

  return {
    requestId: id,
    permitId: record.permitId || '',
    visitor: {
      name: record.visitorName || record.requesterName,
      phone: record.visitorPhone || record.requesterPhone || null,
      relation: record.visitorRelation ?? null,
      sponsorName: sponsored ? record.requesterName : null,
      photoUri: sponsored ? null : summary?.profilePhotoUri || record.requesterPhotoUri || null,
      idTypeOnFile,
      idVerified: Boolean(summary?.identityProof?.verified),
    },
    idPhotoRequired: !idTypeOnFile,
    host: { name: record.targetFacultyName, department: record.targetFacultyDepartment },
    destination: record.destination,
    purpose: record.purpose,
    visitStartAt: toDate(record.visitStartAt),
    visitEndAt: toDate(record.visitEndAt),
    plate: record.vehiclePlate,
    watchlist: await checkWatchlist(permitSubject(record)),
  };
}

export type PermitPreviewResult =
  | { ok: true; preview: PermitPreview }
  | {
      ok: false;
      reason: PermitRefusalReason | 'invalid_pass' | 'not_permit';
      detail: string;
      preview?: PermitPreview;
    };

/**
 * Read-only look at a permit, for the check-in screen. Unlike `scanPass` this never
 * records anything - reopening the check-in screen must not sign someone out because
 * another officer admitted them in the meantime.
 */
async function previewPermit(passToken: string): Promise<PermitPreviewResult> {
  const verification = verifyPass(passToken, new Date(), { ignoreExpiry: true });
  if (!verification.ok) {
    return {
      ok: false,
      reason: 'invalid_pass',
      detail: PASS_FAILURE_DETAIL[verification.reason],
    };
  }
  if (verification.pass.kind !== 'permit') {
    return { ok: false, reason: 'not_permit', detail: 'This is not a visit permit' };
  }

  const snap = await getFirestore()
    .collection(VISITS_COLLECTION)
    .doc(verification.pass.entryId)
    .get();
  if (!snap.exists) {
    return { ok: false, reason: 'not_found', detail: 'No visit request matches this permit.' };
  }

  const record = snap.data() as VisitRequestRecord;
  const preview = await buildPreview(snap.id, record);
  const refusal = permitRefusal(record, new Date());
  return refusal ? { ok: false, ...refusal, preview } : { ok: true, preview };
}

/**
 * Admit a permit holder: create their gate entry and mark the permit used, in one
 * transaction, so two officers confirming the same permit at two gates cannot both
 * succeed, and a cancel that lands first wins.
 */
async function checkInPermit(input: CheckInPermitInput, officer: Officer): Promise<PublicGateEntry> {
  const passToken = String(input.passToken || '').trim();
  const verification = verifyPass(passToken, new Date(), { ignoreExpiry: true });
  if (!verification.ok) {
    throw new GateValidationError(PASS_FAILURE_DETAIL[verification.reason]);
  }
  if (verification.pass.kind !== 'permit') {
    throw new GateValidationError('This is not a visit permit');
  }

  const idType = text(input.idType, 60);
  if (!idType) {
    throw new GateValidationError('Select which ID document you checked');
  }

  const idImageDataUri = cleanIdPhoto(input.idImageDataUri);
  const companions = cleanCompanions(input.companions);
  const gate = text(input.gate, 60) || null;

  const db = getFirestore();
  const requestRef = db.collection(VISITS_COLLECTION).doc(verification.pass.entryId);

  // Read once outside the transaction for the profile and watchlist lookups; the
  // transaction re-reads and re-checks the request itself.
  const first = await requestRef.get();
  if (!first.exists) {
    throw new PermitRefusedError('not_found', 'No visit request matches this permit.');
  }
  const firstRecord = first.data() as VisitRequestRecord;
  const preview = await buildPreview(first.id, firstRecord);
  if (preview.idPhotoRequired && !idImageDataUri) {
    throw new GateValidationError(
      'This visitor has no ID on file. Photograph the ID document you checked.'
    );
  }

  // `vehicle` omitted: use the plate from the request. `vehicle: null`: the officer
  // cleared it - they came on foot.
  const chosenVehicle: GateEntry['vehicle'] =
    input.vehicle === undefined
      ? firstRecord.vehiclePlate
        ? {
            plate: firstRecord.vehiclePlate,
            plateRaw: firstRecord.vehiclePlate,
            source: 'manual',
            confidence: null,
            make: firstRecord.vehicleModel ?? null,
            color: null,
          }
        : null
      : cleanVehicle(input.vehicle);

  const watchlist = await screenAtGate(
    permitSubject(firstRecord, chosenVehicle?.plate ?? null),
    input.watchlistOverride as WatchlistOverrideInput | undefined,
    { visitorName: preview.visitor.name, gate, officer }
  );

  const entryRef = db.collection(ENTRIES_COLLECTION).doc();
  const now = new Date();

  const entry = await db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists) {
      throw new PermitRefusedError('not_found', 'No visit request matches this permit.');
    }

    const record = snap.data() as VisitRequestRecord;
    const refusal = permitRefusal(record, now);
    if (refusal) throw new PermitRefusedError(refusal.reason, refusal.detail);

    const end = toDate(record.visitEndAt) ?? now;
    const expiresAt = new Date(
      Math.max(end.getTime(), now.getTime()) + PERMIT_EXIT_GRACE_HOURS * 60 * 60 * 1000
    );

    const created: GateEntry = {
      id: entryRef.id,
      passCode: record.permitId || verification.pass.passCode,
      visitorName: record.visitorName || record.requesterName,
      phone: normalizePhone(record.visitorPhone || record.requesterPhone || ''),
      email: null,
      purpose: record.purpose,
      hostName: record.targetFacultyName,
      visitorSubtype: null,
      companions,
      partySize: companions.length + 1,
      vehicle: chosenVehicle,
      idProof: {
        idType,
        idLastFour: cleanIdLastFour(input.idLastFour),
        storageUri: null,
        imageDataUri: idImageDataUri,
        capturedAt: Timestamp.fromDate(now),
      },
      status: 'on_campus',
      entryAt: Timestamp.fromDate(now),
      exitAt: null,
      expiresAt: Timestamp.fromDate(expiresAt),
      gate,
      registeredByUid: officer.uid,
      registeredByEmployeeId: officer.employeeId,
      exitedByUid: null,
      exitedByEmployeeId: null,
      notes: text(input.notes, 500) || null,
      source: 'permit',
      visitRequestId: requestRef.id,
      recurringPassId: null,
      // The requester already sees the permit in their app; no separate pass is sent.
      linkedUserUid: null,
      linkedVia: null,
      linkedAccountLabel: null,
      suggestedUserUid: null,
      suggestedAccountLabel: null,
      watchlistOverride: overrideField(watchlist, officer),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(entryRef, created);
    tx.update(requestRef, {
      gateEntryId: entryRef.id,
      checkedInAt: Timestamp.fromDate(now),
      checkedInBy: officer.employeeId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    recordArrival(tx, created, officer, now, watchlist);

    return created;
  });

  return toPublic({ ...entry, entryAt: now, createdAt: now, updatedAt: now }, now);
}

// =========================================
// Recurring (multi-day) pass check-in
// =========================================

export interface RecurringPreview {
  passId: string;
  passCode: string;
  holderName: string;
  phone: string;
  category: string;
  organisation: string | null;
  purpose: string;
  hostName: string | null;
  plate: string | null;
  idType: string;
  validFrom: string;
  validUntil: string;
  schedule: string;
  watchlist: WatchlistMatch[];
}

async function buildRecurringPreview(id: string, record: RecurringPassRecord): Promise<RecurringPreview> {
  return {
    passId: id,
    passCode: record.passCode,
    holderName: record.holderName,
    phone: record.phone,
    category: record.category,
    organisation: record.organisation,
    purpose: record.purpose,
    hostName: record.hostName,
    plate: record.vehiclePlate,
    idType: record.idType,
    validFrom: record.validFrom,
    validUntil: record.validUntil,
    schedule: `${describeWeekdays(record.weekdays)}, ${record.dailyStart}–${record.dailyEnd}`,
    watchlist: await checkWatchlist({
      phone: record.phone,
      plate: record.vehiclePlate,
      userUid: record.linkedUserUid,
    }),
  };
}

function recurringRefusal(
  record: RecurringPassRecord,
  now: Date
): { reason: string; detail: string } | null {
  if (record.status !== 'active') {
    return { reason: 'revoked', detail: 'This pass has been revoked. Do not admit on it.' };
  }
  if (record.currentEntryId) {
    return { reason: 'already_checked_in', detail: 'This pass is already checked in.' };
  }
  return scheduleRefusal(record, now);
}

/**
 * Check a recurring pass holder in for today. `screened` is passed when the watchlist was
 * already resolved moments ago (security issuing the pass and admitting in one step).
 */
async function recurringCheckInById(
  passId: string,
  officer: Officer,
  options: {
    gate?: string | null;
    watchlistOverride?: WatchlistOverrideInput;
    screened?: { matches: WatchlistMatch[]; overrideReason: string | null };
  } = {}
): Promise<PublicGateEntry> {
  const db = getFirestore();
  const passRef = db.collection(RECURRING_COLLECTION).doc(passId);
  const gate = text(options.gate, 60) || null;

  const first = await passRef.get();
  if (!first.exists) throw new PermitRefusedError('not_found', 'No pass matches this QR code.');
  const firstRecord = first.data() as RecurringPassRecord;

  const watchlist =
    options.screened ??
    (await screenAtGate(
      { phone: firstRecord.phone, plate: firstRecord.vehiclePlate, userUid: firstRecord.linkedUserUid },
      options.watchlistOverride,
      { visitorName: firstRecord.holderName, gate, officer }
    ));

  const entryRef = db.collection(ENTRIES_COLLECTION).doc();
  const now = new Date();

  const entry = await db.runTransaction(async (tx) => {
    const snap = await tx.get(passRef);
    if (!snap.exists) throw new PermitRefusedError('not_found', 'No pass matches this QR code.');
    const record = snap.data() as RecurringPassRecord;

    const refusal = recurringRefusal(record, now);
    if (refusal) throw new PermitRefusedError(refusal.reason, refusal.detail);

    const created: GateEntry = {
      id: entryRef.id,
      passCode: record.passCode,
      visitorName: record.holderName,
      phone: record.phone,
      email: record.email,
      purpose: record.purpose,
      hostName: record.hostName ?? record.organisation,
      visitorSubtype: null,
      companions: [],
      partySize: 1,
      vehicle: record.vehiclePlate
        ? {
            plate: record.vehiclePlate,
            plateRaw: record.vehiclePlate,
            source: 'manual',
            confidence: null,
            make: null,
            color: null,
          }
        : null,
      // The document was inspected when the pass was issued; the photo stays on the pass
      // rather than being copied into every day's entry.
      idProof: {
        idType: record.idType,
        idLastFour: record.idLastFour,
        storageUri: null,
        imageDataUri: null,
        capturedAt: Timestamp.fromDate(now),
      },
      status: 'on_campus',
      entryAt: Timestamp.fromDate(now),
      exitAt: null,
      expiresAt: Timestamp.fromDate(todaysDeadline(record, now)),
      gate,
      registeredByUid: officer.uid,
      registeredByEmployeeId: officer.employeeId,
      exitedByUid: null,
      exitedByEmployeeId: null,
      notes: null,
      source: 'recurring',
      visitRequestId: null,
      recurringPassId: passRef.id,
      // The holder sees the recurring pass itself in their app, not each day's entry.
      linkedUserUid: null,
      linkedVia: null,
      linkedAccountLabel: null,
      suggestedUserUid: null,
      suggestedAccountLabel: null,
      watchlistOverride: overrideField(watchlist, officer),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(entryRef, created);
    tx.update(passRef, {
      currentEntryId: entryRef.id,
      lastEntryAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
    });
    recordArrival(tx, created, officer, now, watchlist);

    return created;
  });

  return toPublic({ ...entry, entryAt: now, createdAt: now, updatedAt: now }, now);
}

/** Check-in from a scanned QR: the token must be a genuine recurring pass. */
async function recurringCheckIn(
  input: { passToken?: string; gate?: string; watchlistOverride?: WatchlistOverrideInput },
  officer: Officer
): Promise<PublicGateEntry> {
  const verification = verifyPass(String(input.passToken || '').trim(), new Date(), {
    ignoreExpiry: true,
  });
  if (!verification.ok) throw new GateValidationError(PASS_FAILURE_DETAIL[verification.reason]);
  if (verification.pass.kind !== 'recurring') {
    throw new GateValidationError('This is not a regular (multi-day) pass');
  }
  return recurringCheckInById(verification.pass.entryId, officer, {
    gate: input.gate,
    watchlistOverride: input.watchlistOverride,
  });
}

// =========================================
// The one scanner
// =========================================

export type ScanResult =
  | { action: 'exit'; result: ExitResult }
  | { action: 'check_in'; preview: PermitPreview }
  | { action: 'check_in_recurring'; recurring: RecurringPreview }
  | {
      action: 'refused';
      reason: string;
      detail: string;
      preview?: PermitPreview;
      recurring?: RecurringPreview;
    };

/**
 * One scanner for every pass. The officer does not choose "entry" or "exit": a walk-in
 * pass, or a permit or regular pass that is checked in, is an exit; a permit or regular
 * pass that is not checked in is an arrival, answered with a preview for the officer to
 * confirm. Nothing is written for an arrival until the officer confirms it.
 */
async function scanPass(passToken: string, officer: Officer): Promise<ScanResult> {
  const verification = verifyPass(passToken, new Date(), { ignoreExpiry: true });
  if (!verification.ok || verification.pass.kind === 'walkin') {
    return { action: 'exit', result: await recordExit(passToken, officer) };
  }

  const id = verification.pass.entryId;
  const db = getFirestore();

  if (verification.pass.kind === 'recurring') {
    const snap = await db.collection(RECURRING_COLLECTION).doc(id).get();
    if (!snap.exists) return { action: 'exit', result: { ok: false, reason: 'not_found' } };

    const record = snap.data() as RecurringPassRecord;
    if (record.currentEntryId) {
      return { action: 'exit', result: await recordExit(passToken, officer) };
    }

    const recurring = await buildRecurringPreview(id, record);
    const refusal = recurringRefusal(record, new Date());
    if (refusal) return { action: 'refused', ...refusal, recurring };
    return { action: 'check_in_recurring', recurring };
  }

  const snap = await db.collection(VISITS_COLLECTION).doc(id).get();
  if (!snap.exists) return { action: 'exit', result: { ok: false, reason: 'not_found' } };

  const record = snap.data() as VisitRequestRecord;
  if (record.gateEntryId) {
    return { action: 'exit', result: await recordExit(passToken, officer) };
  }

  const preview = await buildPreview(id, record);
  const refusal = permitRefusal(record, new Date());
  if (refusal) return { action: 'refused', ...refusal, preview };

  return { action: 'check_in', preview };
}

// =========================================
// Lists
// =========================================

/**
 * Everyone currently inside.
 *
 * Overstays first - someone whose pass ran out is who the officer needs to find - then by
 * entry time descending, so the most recent arrivals are next.
 */
async function listOnCampus(limit = 100): Promise<PublicGateEntry[]> {
  const db = getFirestore();
  const cap = Math.max(1, Math.min(Number(limit) || 100, 500));
  const inside = db.collection(ENTRIES_COLLECTION).where('status', '==', 'on_campus');
  const docs = await withIndexFallback(
    'gate_entries: status + entryAt',
    async () => (await inside.orderBy('entryAt', 'desc').limit(cap).get()).docs.map((d) => d.data() as GateEntry),
    async () =>
      (await inside.limit(2000).get()).docs
        .map((d) => d.data() as GateEntry)
        .sort(byNewest((e) => e.entryAt))
        .slice(0, cap)
  );

  const now = new Date();
  const entries = docs.map((entry) => toPublic(entry, now));
  return [...entries.filter((e) => e.overstay), ...entries.filter((e) => !e.overstay)];
}

/** Visitors still inside after their pass expired, longest overstay first. */
async function listOverstays(): Promise<PublicGateEntry[]> {
  const inside = await listOnCampus(500);
  return inside.filter((e) => e.overstay).sort((a, b) => b.overstayMinutes - a.overstayMinutes);
}

/**
 * Look an entry up by pass code, number plate or phone number.
 *
 * These are the three things an officer can read off a person or a car when the QR will
 * not scan - a cracked screen, a dead phone, a plate seen through a windscreen. Without
 * this, a failed scan has no fallback but a phone call.
 */
async function findEntries(query: string, limit = 25): Promise<PublicGateEntry[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const db = getFirestore();
  const collection = db.collection(ENTRIES_COLLECTION);

  const byPassCode = await collection
    .where('passCode', '==', trimmed.toUpperCase())
    .limit(limit)
    .get();

  if (!byPassCode.empty) {
    return byPassCode.docs.map((doc) => toPublic(doc.data() as GateEntry));
  }

  // Newest visits for one plate or phone number. Ordered by Firestore once the composite
  // index exists; until then, the matches are sorted here.
  const newestWhere = (field: string, value: string) => {
    const matching = collection.where(field, '==', value);
    return withIndexFallback(
      `gate_entries: ${field} + entryAt`,
      async () => (await matching.orderBy('entryAt', 'desc').limit(limit).get()).docs.map((d) => d.data() as GateEntry),
      async () =>
        (await matching.limit(500).get()).docs
          .map((d) => d.data() as GateEntry)
          .sort(byNewest((e) => e.entryAt))
          .slice(0, limit)
    );
  };

  const byPlate = await newestWhere('vehicle.plate', normalizePlate(trimmed));
  if (byPlate.length > 0) return byPlate.map((entry) => toPublic(entry));

  const byPhone = await newestWhere('phone', normalizePhone(trimmed));
  return byPhone.map((entry) => toPublic(entry));
}

/**
 * Entries registered by this officer, newest first. What the gate screen shows under
 * "today" so an officer can find and re-issue a record they just created.
 */
async function listByOfficer(uid: string, limit = 50): Promise<PublicGateEntry[]> {
  const db = getFirestore();
  const cap = Math.max(1, Math.min(Number(limit) || 50, 100));
  const mine = db.collection(ENTRIES_COLLECTION).where('registeredByUid', '==', uid);
  const docs = await withIndexFallback(
    'gate_entries: registeredByUid + entryAt',
    async () => (await mine.orderBy('entryAt', 'desc').limit(cap).get()).docs.map((d) => d.data() as GateEntry),
    async () =>
      (await mine.limit(1000).get()).docs
        .map((d) => d.data() as GateEntry)
        .sort(byNewest((e) => e.entryAt))
        .slice(0, cap)
  );

  return docs.map((entry) => toPublic(entry));
}

/** Entries that arrived in [from, to), newest first — for admin records and reports. */
async function listEntriesInRange(from: Date, to: Date, limit = 10000): Promise<GateEntry[]> {
  const snapshot = await getFirestore()
    .collection(ENTRIES_COLLECTION)
    .where('entryAt', '>=', Timestamp.fromDate(from))
    .where('entryAt', '<', Timestamp.fromDate(to))
    .orderBy('entryAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as GateEntry);
}

/**
 * Walk-in passes sent to this visitor's account: anything still open, and the last week
 * of closed ones. Each open one comes with a fresh QR token.
 */
async function listLinkedEntries(
  uid: string
): Promise<{ entry: PublicGateEntry; passToken: string | null }[]> {
  const linked = getFirestore().collection(ENTRIES_COLLECTION).where('linkedUserUid', '==', uid);
  const docs = await withIndexFallback(
    'gate_entries: linkedUserUid + entryAt',
    async () => (await linked.orderBy('entryAt', 'desc').limit(20).get()).docs.map((d) => d.data() as GateEntry),
    async () =>
      (await linked.limit(500).get()).docs
        .map((d) => d.data() as GateEntry)
        .sort(byNewest((e) => e.entryAt))
        .slice(0, 20)
  );

  const now = new Date();
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  return docs
    .filter((entry) => entry.status === 'on_campus' || (toDate(entry.entryAt)?.getTime() ?? 0) > weekAgo)
    .map((entry) => {
      const expiresAt = toDate(entry.expiresAt);
      const open = entry.status === 'on_campus' && expiresAt !== null && expiresAt > now;
      return {
        entry: toPublic(entry, now),
        passToken: open
          ? issuePass({
              entryId: entry.id,
              passCode: entry.passCode,
              visitorName: entry.visitorName,
              partySize: entry.partySize,
              plate: entry.vehicle?.plate ?? null,
              expiresAt: expiresAt!,
            })
          : null,
      };
    });
}

/**
 * Re-issue the pass token for an existing entry.
 *
 * A visitor's phone dies, or the screenshot is lost. Re-issuing produces a token with the
 * same claims and the same expiry - deliberately not a fresh expiry, which would let a
 * pass be extended indefinitely simply by asking for another copy.
 */
async function reissuePass(
  entryId: string
): Promise<{ entry: PublicGateEntry; passToken: string } | null> {
  const db = getFirestore();
  const doc = await db.collection(ENTRIES_COLLECTION).doc(entryId).get();
  if (!doc.exists) return null;

  const entry = doc.data() as GateEntry;
  const expiresAt = toDate(entry.expiresAt);
  if (!expiresAt) return null;

  return {
    entry: toPublic(entry),
    passToken: issuePass({
      entryId: entry.id,
      passCode: entry.passCode,
      visitorName: entry.visitorName,
      partySize: entry.partySize,
      plate: entry.vehicle?.plate ?? null,
      expiresAt,
    }),
  };
}

export {
  registerEntry,
  getEntry,
  getEntryIdPhoto,
  linkEntryToSuggestedAccount,
  recordExit,
  recordDenial,
  scanPass,
  previewPermit,
  checkInPermit,
  recurringCheckIn,
  recurringCheckInById,
  buildRecurringPreview,
  listOnCampus,
  listOverstays,
  listByOfficer,
  listEntriesInRange,
  listLinkedEntries,
  findEntries,
  reissuePass,
  cleanVehicle,
  normalizePhone,
  isRecognisedFormat,
  DEFAULT_VALID_HOURS,
  MAX_VALID_HOURS,
};


/**
 * Fetch identity document from identity_documents collection
 * Generates signed download URL from Firebase Storage if needed
 */
async function fetchIdentityDocument(userId: string): Promise<{ documentUrl: string; documentType: string } | null> {
  const db = getFirestore();
  
  try {
    console.log(`[fetchIdentityDocument] Fetching for user: ${userId}`);
    
    const identityDocsSnapshot = await db.collection('identity_documents')
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (identityDocsSnapshot.empty) {
      console.log(`[fetchIdentityDocument] No document found`);
      return null;
    }
    
    const identityDoc = identityDocsSnapshot.docs[0];
    const identityData = identityDoc.data();
    
    console.log(`[fetchIdentityDocument] Found: ${identityData.documentName}`);
    
    // If documentUrl already exists and is valid, return it
    if (identityData.documentUrl && identityData.documentUrl.startsWith('http')) {
      return {
        documentUrl: identityData.documentUrl,
        documentType: identityData.idType || 'Government ID',
      };
    }
    
    // Generate download URL from storageUri
    if (identityData.storageUri) {
      try {
        const bucket = admin.storage().bucket();
        
        // Extract file path from storageUri
        // Format: "firestore://users/{userId}/identity_documents/{filename}"
        // Or: "gs://bucket-name/path/to/file"
        let filePath = identityData.storageUri;
        
        if (filePath.startsWith('firestore://')) {
          // Convert firestore:// to actual storage path
          filePath = filePath.replace('firestore://', '');
        } else if (filePath.startsWith('gs://')) {
          // Extract path from gs:// URL
          filePath = filePath.split('/').slice(3).join('/');
        }
        
        console.log(`[fetchIdentityDocument] Generating signed URL for: ${filePath}`);
        
        const file = bucket.file(filePath);
        
        // Check if file exists
        const [exists] = await file.exists();
        
        if (!exists) {
          console.error(`[fetchIdentityDocument] File not found in storage: ${filePath}`);
          return null;
        }
        
        // Generate signed URL valid for 1 hour
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // 1 hour
        });
        
        console.log(`[fetchIdentityDocument] Generated signed URL successfully`);
        
        return {
          documentUrl: signedUrl,
          documentType: identityData.idType || 'Government ID',
        };
      } catch (storageError) {
        console.error('[fetchIdentityDocument] Error generating signed URL:', storageError);
        return null;
      }
    }
    
    console.log(`[fetchIdentityDocument] No valid URL or storageUri found`);
    return null;
  } catch (error) {
    console.error('[fetchIdentityDocument] Error:', error);
    return null;
  }
}

/**
 * Find Approved Request
 * 
 * Find an approved visit request by visitor's phone number or request ID.
 * Used by security officer before biometric verification.
 */
export async function findApprovedRequest(
  phone?: string,
  requestId?: string
): Promise<any | null> {
  const db = getFirestore();
  
  try {
    console.log(`[findApprovedRequest] Searching with phone: ${phone}, requestId: ${requestId}`);
    
    if (requestId) {
      // Direct lookup by request ID
      console.log(`[findApprovedRequest] Looking up by requestId: ${requestId}`);
      const doc = await db.collection(VISITS_COLLECTION).doc(requestId).get();
      
      if (!doc.exists) {
        console.log(`[findApprovedRequest] Request ID ${requestId} not found`);
        return null;
      }
      
      const data = doc.data();
      console.log(`[findApprovedRequest] Found document with status: ${data?.status}`);
      
      if (data?.status !== 'approved') {
        console.log(`[findApprovedRequest] Request ${requestId} status is not 'approved': ${data?.status}`);
        return null;
      }
      
      // Handle both old and new schema
      const userId = data.requesterId || data.sponsoredBy;
      let requesterData: any = {};
      
      if (userId) {
        // Fetch requester's details from users collection
        const requesterDoc = await db.collection('users').doc(userId).get();
        requesterData = requesterDoc.exists ? requesterDoc.data() : {};
        console.log(`[findApprovedRequest] Fetched user data for ${userId}`);
      } else {
        console.log(`[findApprovedRequest] No requesterId found, using data from request document`);
      }
      
      // Build response with all fields
      console.log(`[findApprovedRequest] Building response for user ${userId}`);
      console.log(`[findApprovedRequest] identityProof present:`, !!requesterData?.identityProof);
      if (requesterData?.identityProof) {
        console.log(`[findApprovedRequest] identityProof.documentUri present:`, !!requesterData.identityProof.documentUri);
        console.log(`[findApprovedRequest] identityProof.documentUri length:`, requesterData.identityProof.documentUri?.length || 0);
        console.log(`[findApprovedRequest] identityProof.idType:`, requesterData.identityProof.idType);
      }
      
      return {
        id: doc.id,
        requesterId: userId || 'unknown',
        requesterName: data.requesterName || data.visitorName || 'Unknown',
        requesterPhone: data.requesterPhone || data.visitorPhone || '',
        requesterEmail: data.requesterEmail || '',
        requesterPhotoURL: requesterData?.photoURL || requesterData?.photoUri || data.requesterPhotoUri,
        identityDocument: requesterData?.identityProof?.documentUri || requesterData?.identityDocument,
        identityDocumentType: requesterData?.identityProof?.idType || requesterData?.identityDocumentType,
        destination: data.destination,
        purpose: data.purpose,
        visitDate: data.visitDate,
        timeWindow: data.timeWindow,
        visitStartAt: data.visitStartAt,
        visitEndAt: data.visitEndAt,
        targetFacultyName: data.targetFacultyName,
        targetFacultyDepartment: data.targetFacultyDepartment,
        targetFacultyPhotoURL: data.targetFacultyPhotoURL,
        facultyRemarks: data.facultyRemarks,
        status: data.status,
        visitType: data.visitType,
      };
    }
    
    if (phone) {
      // Search by phone number - try both requesterId lookup and direct visitorPhone match
      const normalizedPhone = normalizePhone(phone);
      console.log(`[findApprovedRequest] Searching by phone. Original: ${phone}, Normalized: ${normalizedPhone}`);
      
      // Strategy 1: Find user by phone, then find their approved requests
      const usersSnapshot = await db.collection('users')
        .where('phone', '==', normalizedPhone)
        .limit(1)
        .get();
      
      if (!usersSnapshot.empty) {
        const userDoc = usersSnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();
        console.log(`[findApprovedRequest] Found user: ${userId}`);
        
        // Find approved request for this user
        const requestsSnapshot = await db.collection(VISITS_COLLECTION)
          .where('requesterId', '==', userId)
          .where('status', '==', 'approved')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        
        if (!requestsSnapshot.empty) {
          const requestDoc = requestsSnapshot.docs[0];
          const requestData = requestDoc.data();
          console.log(`[findApprovedRequest] Found approved request via requesterId: ${requestDoc.id}`);
          
          return {
            id: requestDoc.id,
            requesterId: userId,
            requesterName: requestData.requesterName || requestData.visitorName || userData.displayName,
            requesterPhone: normalizedPhone,
            requesterEmail: requestData.requesterEmail || userData.email,
            requesterPhotoURL: userData?.photoURL || userData?.photoUri,
            identityDocument: userData?.identityProof?.documentUri || userData?.identityDocument,
            identityDocumentType: userData?.identityProof?.idType || userData?.identityDocumentType,
            destination: requestData.destination,
            purpose: requestData.purpose,
            visitDate: requestData.visitDate,
            timeWindow: requestData.timeWindow,
            visitStartAt: requestData.visitStartAt,
            visitEndAt: requestData.visitEndAt,
            targetFacultyName: requestData.targetFacultyName,
            targetFacultyDepartment: requestData.targetFacultyDepartment,
            targetFacultyPhotoURL: requestData.targetFacultyPhotoURL,
            facultyRemarks: requestData.facultyRemarks,
            status: requestData.status,
            visitType: requestData.visitType,
          };
        }
      }
      
      // Strategy 2: Query visitRequests directly by visitorPhone (for old schema)
      // Try multiple phone formats since storage format varies
      console.log(`[findApprovedRequest] Trying direct visitorPhone query for old schema documents`);
      
      const phoneFormats = [
        `+91${normalizedPhone}`,  // +911234567890
        normalizedPhone,           // 1234567890
        `91${normalizedPhone}`,    // 911234567890
      ];
      
      for (const phoneFormat of phoneFormats) {
        console.log(`[findApprovedRequest] Trying phone format: ${phoneFormat}`);
        
        const directQuerySnapshot = await db.collection(VISITS_COLLECTION)
          .where('visitorPhone', '==', phoneFormat)
          .where('status', '==', 'approved')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        
        if (!directQuerySnapshot.empty) {
          const requestDoc = directQuerySnapshot.docs[0];
          const requestData = requestDoc.data();
          console.log(`[findApprovedRequest] Found approved request via visitorPhone: ${requestDoc.id}`);
          
          // Try to get user data if requesterId exists
          let userData: any = {};
          if (requestData.requesterId) {
            const userDoc = await db.collection('users').doc(requestData.requesterId).get();
            userData = userDoc.exists ? userDoc.data() : {};
            console.log(`[findApprovedRequest] User data fetched for ${requestData.requesterId}`);
            console.log(`[findApprovedRequest] identityProof present:`, !!userData?.identityProof);
            if (userData?.identityProof) {
              console.log(`[findApprovedRequest] documentUri present:`, !!userData.identityProof.documentUri);
              console.log(`[findApprovedRequest] documentUri length:`, userData.identityProof.documentUri?.length || 0);
            }
          }
          
          return {
            id: requestDoc.id,
            requesterId: requestData.requesterId || 'unknown',
            requesterName: requestData.requesterName || requestData.visitorName,
            requesterPhone: requestData.visitorPhone || requestData.requesterPhone,
            requesterEmail: requestData.requesterEmail || '',
            requesterPhotoURL: userData?.photoURL || userData?.photoUri || requestData.requesterPhotoUri,
            identityDocument: userData?.identityProof?.documentUri || userData?.identityDocument,
            identityDocumentType: userData?.identityProof?.idType || userData?.identityDocumentType,
            destination: requestData.destination,
            purpose: requestData.purpose,
            visitDate: requestData.visitDate,
            timeWindow: requestData.timeWindow,
            visitStartAt: requestData.visitStartAt,
            visitEndAt: requestData.visitEndAt,
            targetFacultyName: requestData.targetFacultyName,
            targetFacultyDepartment: requestData.targetFacultyDepartment,
            targetFacultyPhotoURL: requestData.targetFacultyPhotoURL,
            facultyRemarks: requestData.facultyRemarks,
            status: requestData.status,
            visitType: requestData.visitType,
          };
        }
      }
      
      // Strategy 3: Also try requesterPhone field as fallback
      console.log(`[findApprovedRequest] Trying requesterPhone query as fallback`);
      
      for (const phoneFormat of phoneFormats) {
        const fallbackQuery = await db.collection(VISITS_COLLECTION)
          .where('requesterPhone', '==', phoneFormat)
          .where('status', '==', 'approved')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        
        if (!fallbackQuery.empty) {
          const requestDoc = fallbackQuery.docs[0];
          const requestData = requestDoc.data();
          console.log(`[findApprovedRequest] Found approved request via requesterPhone: ${requestDoc.id}`);
          
          // Try to get user data if requesterId exists
          let userData: any = {};
          if (requestData.requesterId) {
            const userDoc = await db.collection('users').doc(requestData.requesterId).get();
            userData = userDoc.exists ? userDoc.data() : {};
            console.log(`[findApprovedRequest] User data fetched for ${requestData.requesterId}`);
            console.log(`[findApprovedRequest] identityProof present:`, !!userData?.identityProof);
            if (userData?.identityProof) {
              console.log(`[findApprovedRequest] documentUri present:`, !!userData.identityProof.documentUri);
              console.log(`[findApprovedRequest] documentUri length:`, userData.identityProof.documentUri?.length || 0);
            }
          }
          
          return {
            id: requestDoc.id,
            requesterId: requestData.requesterId || 'unknown',
            requesterName: requestData.requesterName || requestData.visitorName,
            requesterPhone: requestData.requesterPhone || requestData.visitorPhone,
            requesterEmail: requestData.requesterEmail || '',
            requesterPhotoURL: userData?.photoURL || userData?.photoUri || requestData.requesterPhotoUri,
            identityDocument: userData?.identityProof?.documentUri || userData?.identityDocument,
            identityDocumentType: userData?.identityProof?.idType || userData?.identityDocumentType,
            destination: requestData.destination,
            purpose: requestData.purpose,
            visitDate: requestData.visitDate,
            timeWindow: requestData.timeWindow,
            visitStartAt: requestData.visitStartAt,
            visitEndAt: requestData.visitEndAt,
            targetFacultyName: requestData.targetFacultyName,
            targetFacultyDepartment: requestData.targetFacultyDepartment,
            targetFacultyPhotoURL: requestData.targetFacultyPhotoURL,
            facultyRemarks: requestData.facultyRemarks,
            status: requestData.status,
            visitType: requestData.visitType,
          };
        }
      }
      
      console.log(`[findApprovedRequest] No approved requests found for phone: ${normalizedPhone}`);
      return null;
    }
    
    return null;
  } catch (error) {
    console.error('Error finding approved request:', error);
    throw error;
  }
}

/**
 * Activate Permit
 * 
 * Generate QR code, set expiry, and change status from 'approved' to 'permit_active'
 * after biometric verification at gate.
 */
export async function activatePermit(
  requestId: string,
  officer: Officer,
  vehicleNumber?: string
): Promise<{ permitId: string; qrPayload: string; expiresAt: Date }> {
  const db = getFirestore();
  
  try {
    const requestRef = db.collection(VISITS_COLLECTION).doc(requestId);
    const requestDoc = await requestRef.get();
    
    if (!requestDoc.exists) {
      throw new GateValidationError('Request not found');
    }
    
    const requestData = requestDoc.data() as VisitRequestRecord;
    
    if (requestData.status !== 'approved') {
      throw new GateValidationError('Request is not in approved status');
    }
    
    // Generate permit ID
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const permitId = `PERMIT-${dateStr}-${random}`;
    const passCode = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    // Parse visit end time for expiry
    console.log('[activatePermit] requestData.visitEndAt:', requestData.visitEndAt);
    console.log('[activatePermit] requestData.visitEndAt type:', typeof requestData.visitEndAt);
    
    let visitEndAt: Date;
    if (requestData.visitEndAt instanceof Date) {
      visitEndAt = requestData.visitEndAt;
    } else if (typeof requestData.visitEndAt === 'string') {
      visitEndAt = new Date(requestData.visitEndAt);
    } else if (requestData.visitEndAt && typeof requestData.visitEndAt.toDate === 'function') {
      // Firestore Timestamp
      visitEndAt = requestData.visitEndAt.toDate();
    } else {
      // Fallback: 24 hours from now
      console.warn('[activatePermit] Could not parse visitEndAt, using default 24h expiry');
      visitEndAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
    
    // Validate the date
    if (isNaN(visitEndAt.getTime())) {
      console.warn('[activatePermit] Invalid visitEndAt, using default 24h expiry');
      visitEndAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
    
    console.log('[activatePermit] Parsed visitEndAt:', visitEndAt);
    console.log('[activatePermit] visitEndAt.getTime():', visitEndAt.getTime());
    
    // Generate signed JWT payload for QR code
    const qrPayload = issuePass({
      entryId: permitId,
      passCode: passCode,
      visitorName: requestData.requesterName,
      partySize: 1,
      plate: vehicleNumber || null,
      issuedAt: now,
      expiresAt: visitEndAt,
      kind: 'permit',
    });
    
    // Prepare update data
    const updateData: any = {
      status: 'permit_active',
      permitId,
      permitQRPayload: qrPayload,
      permitExpiresAt: Timestamp.fromDate(visitEndAt),
      permitActivatedAt: Timestamp.fromDate(now),
      activatedByOfficer: officer.employeeId,
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    // Include vehicle number if provided
    if (vehicleNumber) {
      updateData.vehicleNumber = vehicleNumber.toUpperCase();
      console.log(`[activatePermit] Including vehicle: ${vehicleNumber}`);
    }
    
    // Update Firestore document
    await requestRef.update(updateData);
    
    // Log the activation
    await recordAudit({
      actor: {
        uid: officer.uid,
        employeeId: officer.employeeId || null,
        role: officer.role || null,
      },
      action: 'pass.recurring_issue', // Using closest available action type
      targetType: 'permit',
      targetId: permitId,
      summary: `Permit activated for ${requestData.requesterName} (Request: ${requestId})${vehicleNumber ? ` with vehicle ${vehicleNumber}` : ''}`,
      meta: {
        requestId,
        permitId,
        visitorName: requestData.requesterName,
        vehicleNumber: vehicleNumber || null,
        activatedBy: officer.uid,
      },
    });
    
    return {
      permitId,
      qrPayload,
      expiresAt: visitEndAt,
    };
  } catch (error) {
    console.error('Error activating permit:', error);
    throw error;
  }
}
