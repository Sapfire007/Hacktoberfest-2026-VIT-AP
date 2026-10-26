/**
 * Audit log (PRD.md FR-ADM-05).
 *
 * One row per consequential action by a staff member: account changes, watchlist edits,
 * overrides at the gate, passes issued or revoked, sensitive records viewed. Rows are
 * append-only — nothing in the API updates or deletes them — and each names the person
 * who acted, taken from their verified token.
 *
 * Writing an audit row must never be the reason an action fails: the action has already
 * happened by the time it is recorded. A failure is logged loudly instead.
 */

import { FieldValue, Timestamp, Firestore, WriteBatch, Transaction } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase.admin';
import { UserRole } from '../types';

export const AUDIT_COLLECTION = process.env.FIRESTORE_COLLECTION_AUDIT || 'audit_log';

export interface Actor {
  uid: string;
  employeeId?: string | null;
  role?: UserRole | null;
}

export type AuditAction =
  | 'staff.create'
  | 'staff.reset_password'
  | 'staff.deactivate'
  | 'staff.reactivate'
  | 'user.suspend'
  | 'user.reactivate'
  | 'watchlist.add'
  | 'watchlist.clear'
  | 'gate.watchlist_override'
  | 'gate.watchlist_denied'
  | 'pass.recurring_issue'
  | 'pass.recurring_revoke'
  | 'pass.account_link'
  | 'record.id_photo_view'
  | 'report.download';

export interface AuditInput {
  actor: Actor;
  action: AuditAction;
  targetType: string;
  targetId: string;
  /** One readable line: what happened, to whom. Shown as-is in the console. */
  summary: string;
  meta?: Record<string, unknown>;
}

function toRow(input: AuditInput) {
  return {
    actorUid: input.actor.uid,
    actorEmployeeId: input.actor.employeeId || null,
    actorRole: input.actor.role || null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary.slice(0, 500),
    meta: input.meta ?? null,
    at: FieldValue.serverTimestamp(),
  };
}

/** Record an action on its own. Never throws. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await getFirestore().collection(AUDIT_COLLECTION).doc().set(toRow(input));
  } catch (error) {
    console.error(`AUDIT WRITE FAILED [${input.action} ${input.targetId}]:`, (error as Error).message);
  }
}

/**
 * Record an action inside the batch or transaction that performs it, so the row exists
 * exactly when the change does.
 */
export function auditIn(
  writer: WriteBatch | Transaction,
  db: Firestore,
  input: AuditInput
): void {
  const ref = db.collection(AUDIT_COLLECTION).doc();
  (writer as WriteBatch).set(ref, toRow(input));
}

export interface PublicAuditRow {
  id: string;
  actorEmployeeId: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  meta: Record<string, unknown> | null;
  at: string | null;
}

export async function listAudit(options: {
  limit?: number;
  before?: string;
  action?: string;
}): Promise<PublicAuditRow[]> {
  let query = getFirestore()
    .collection(AUDIT_COLLECTION)
    .orderBy('at', 'desc') as FirebaseFirestore.Query;

  if (options.before) {
    const before = new Date(options.before);
    if (!Number.isNaN(before.getTime())) query = query.where('at', '<', Timestamp.fromDate(before));
  }

  const snapshot = await query.limit(Math.min(options.limit ?? 100, 200)).get();

  return snapshot.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        actorEmployeeId: d.actorEmployeeId ?? null,
        actorRole: d.actorRole ?? null,
        action: d.action,
        targetType: d.targetType,
        targetId: d.targetId,
        summary: d.summary,
        meta: d.meta ?? null,
        at: d.at instanceof Timestamp ? d.at.toDate().toISOString() : null,
      };
    })
    // Filtered here rather than in the query: an equality filter plus the ordering would
    // need a composite index for every action value, for a list an admin reads by eye.
    .filter((row) => !options.action || row.action.startsWith(options.action));
}
