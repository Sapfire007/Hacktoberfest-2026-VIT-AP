/**
 * Gate log — who came in, who went out, and who was turned away.
 *
 * `gate_entries` holds one record per visit, which is the right shape for "who is on
 * campus", but not for "what happened at the gate between 9 and 10". A recurring pass
 * produces a new entry every day, and a denial produces no entry at all. So every entry,
 * exit and denial also appends one row here, written in the same batch or transaction as
 * the change it describes, giving admin a single time-ordered log to filter and export.
 *
 * Security alerts (watchlist hits, overrides, denials) live beside it in `alerts`, which is
 * what the admin overview's alert feed reads.
 */

import { FieldValue, Firestore, Timestamp, Transaction, WriteBatch } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase.admin';

export const EVENTS_COLLECTION = process.env.FIRESTORE_COLLECTION_GATE_EVENTS || 'gate_events';
export const ALERTS_COLLECTION = process.env.FIRESTORE_COLLECTION_ALERTS || 'alerts';

export type GateEventType = 'entry' | 'exit' | 'denied';
export type GateSource = 'walkin' | 'permit' | 'recurring';

export interface GateEventInput {
  type: GateEventType;
  entryId: string | null;
  recurringPassId?: string | null;
  visitRequestId?: string | null;
  passCode: string | null;
  visitorName: string;
  phone: string | null;
  partySize: number;
  plate: string | null;
  gate: string | null;
  source: GateSource | null;
  officer: { uid: string; employeeId: string };
  /** A watchlist match was overridden (entry) or acted on (denied). */
  flagged?: boolean;
  note?: string | null;
  at: Date;
}

export interface PublicGateEvent {
  id: string;
  type: GateEventType;
  entryId: string | null;
  recurringPassId: string | null;
  visitRequestId: string | null;
  passCode: string | null;
  visitorName: string;
  phone: string | null;
  partySize: number;
  plate: string | null;
  gate: string | null;
  source: GateSource | null;
  officerEmployeeId: string;
  flagged: boolean;
  note: string | null;
  at: string | null;
}

function eventRow(input: GateEventInput) {
  return {
    type: input.type,
    entryId: input.entryId,
    recurringPassId: input.recurringPassId ?? null,
    visitRequestId: input.visitRequestId ?? null,
    passCode: input.passCode,
    visitorName: input.visitorName,
    phone: input.phone,
    partySize: input.partySize,
    plate: input.plate,
    gate: input.gate,
    source: input.source,
    officerUid: input.officer.uid,
    officerEmployeeId: input.officer.employeeId,
    flagged: Boolean(input.flagged),
    note: input.note ?? null,
    at: Timestamp.fromDate(input.at),
  };
}

/** Append a gate event inside the write that causes it. */
export function eventIn(writer: WriteBatch | Transaction, db: Firestore, input: GateEventInput): void {
  (writer as WriteBatch).set(db.collection(EVENTS_COLLECTION).doc(), eventRow(input));
}

function toPublicEvent(id: string, d: FirebaseFirestore.DocumentData): PublicGateEvent {
  return {
    id,
    type: d.type,
    entryId: d.entryId ?? null,
    recurringPassId: d.recurringPassId ?? null,
    visitRequestId: d.visitRequestId ?? null,
    passCode: d.passCode ?? null,
    visitorName: d.visitorName,
    phone: d.phone ?? null,
    partySize: d.partySize ?? 1,
    plate: d.plate ?? null,
    gate: d.gate ?? null,
    source: d.source ?? null,
    officerEmployeeId: d.officerEmployeeId,
    flagged: Boolean(d.flagged),
    note: d.note ?? null,
    at: d.at instanceof Timestamp ? d.at.toDate().toISOString() : null,
  };
}

/**
 * Events in [from, to), newest first. Filters other than time run in memory: the range
 * plus ordering on one field needs no composite index, and a day at one campus is a few
 * thousand rows at most.
 */
export async function listEvents(options: {
  from: Date;
  to: Date;
  type?: GateEventType;
  gate?: string;
  q?: string;
  limit?: number;
}): Promise<PublicGateEvent[]> {
  const snapshot = await getFirestore()
    .collection(EVENTS_COLLECTION)
    .where('at', '>=', Timestamp.fromDate(options.from))
    .where('at', '<', Timestamp.fromDate(options.to))
    .orderBy('at', 'desc')
    .limit(5000)
    .get();

  const q = options.q?.trim().toLowerCase();
  const qDigits = q?.replace(/\D/g, '');
  const qPlate = q?.replace(/[^a-z0-9]/g, '').toUpperCase();

  return snapshot.docs
    .map((doc) => toPublicEvent(doc.id, doc.data()))
    .filter((e) => !options.type || e.type === options.type)
    .filter((e) => !options.gate || e.gate === options.gate)
    .filter(
      (e) =>
        !q ||
        e.visitorName.toLowerCase().includes(q) ||
        (e.passCode ?? '').toLowerCase().includes(q) ||
        (qDigits && qDigits.length >= 4 && (e.phone ?? '').includes(qDigits)) ||
        (qPlate && qPlate.length >= 4 && (e.plate ?? '').includes(qPlate)) ||
        e.officerEmployeeId.toLowerCase().includes(q)
    )
    .slice(0, Math.min(options.limit ?? 500, 5000));
}

export async function listEventsForEntry(entryId: string): Promise<PublicGateEvent[]> {
  const snapshot = await getFirestore()
    .collection(EVENTS_COLLECTION)
    .where('entryId', '==', entryId)
    .get();
  return snapshot.docs
    .map((doc) => toPublicEvent(doc.id, doc.data()))
    .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
}

// =========================================
// Alerts
// =========================================

export type AlertType = 'watchlist_hit' | 'watchlist_override' | 'watchlist_denied';

export interface AlertInput {
  type: AlertType;
  visitorName: string;
  phone: string | null;
  plate: string | null;
  gate: string | null;
  officer: { uid: string; employeeId: string };
  matches: { id: string; name: string; reason: string; matchedOn: string[] }[];
  /** The officer's reason, for an override or denial. */
  reason?: string | null;
  entryId?: string | null;
}

export interface PublicAlert {
  id: string;
  type: AlertType;
  visitorName: string;
  phone: string | null;
  plate: string | null;
  gate: string | null;
  officerEmployeeId: string;
  matches: AlertInput['matches'];
  reason: string | null;
  entryId: string | null;
  at: string | null;
}

function alertRow(input: AlertInput) {
  return {
    type: input.type,
    visitorName: input.visitorName,
    phone: input.phone,
    plate: input.plate,
    gate: input.gate,
    officerUid: input.officer.uid,
    officerEmployeeId: input.officer.employeeId,
    matches: input.matches,
    reason: input.reason ?? null,
    entryId: input.entryId ?? null,
    at: FieldValue.serverTimestamp(),
  };
}

export function alertIn(writer: WriteBatch | Transaction, db: Firestore, input: AlertInput): void {
  (writer as WriteBatch).set(db.collection(ALERTS_COLLECTION).doc(), alertRow(input));
}

/** Raise an alert on its own. Never throws — the gate must keep working. */
export async function raiseAlert(input: AlertInput): Promise<void> {
  try {
    await getFirestore().collection(ALERTS_COLLECTION).doc().set(alertRow(input));
  } catch (error) {
    console.error('ALERT WRITE FAILED:', (error as Error).message);
  }
}

export async function listAlerts(options: { from?: Date; limit?: number } = {}): Promise<PublicAlert[]> {
  let query = getFirestore().collection(ALERTS_COLLECTION) as FirebaseFirestore.Query;
  if (options.from) query = query.where('at', '>=', Timestamp.fromDate(options.from));
  const snapshot = await query.orderBy('at', 'desc').limit(Math.min(options.limit ?? 20, 2000)).get();

  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      type: d.type,
      visitorName: d.visitorName,
      phone: d.phone ?? null,
      plate: d.plate ?? null,
      gate: d.gate ?? null,
      officerEmployeeId: d.officerEmployeeId,
      matches: d.matches ?? [],
      reason: d.reason ?? null,
      entryId: d.entryId ?? null,
      at: d.at instanceof Timestamp ? d.at.toDate().toISOString() : null,
    };
  });
}
