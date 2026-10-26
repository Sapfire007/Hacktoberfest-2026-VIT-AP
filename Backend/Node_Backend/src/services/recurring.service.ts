/**
 * Recurring (multi-day) passes — for people who come on a schedule: vendors, contractors,
 * drivers, mess staff.
 *
 * Registering the same delivery driver as a fresh walk-in every morning wastes the queue's
 * time and fills the register with duplicates. A recurring pass is issued once — by admin
 * in advance, or by security at the gate — with a date range, the weekdays it admits on
 * and daily hours. Its QR is reused: each day a scan checks the holder in (a normal gate
 * entry, on the log, on the on-campus roll) and the next scan checks them out.
 *
 * Security can issue for up to 30 days; longer arrangements go through admin, up to 180.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase.admin';
import { generatePassCode, issuePass } from '../core/gate-pass';
import { normalizePhone } from '../core/phone';
import { normalizePlate } from '../core/plate';
import {
  addDays,
  daysInclusive,
  isDateKey,
  isTimeOfDay,
  istDateKey,
  istDayEnd,
  minutesOfDay,
} from '../core/ist';
import { describeWeekdays } from '../core/recurring-schedule';
import { Actor, auditIn } from './audit.service';
import { findAccountForPass, confirmSuggestedLink } from './account-link.service';
import { screenAtGate } from './watchlist.service';
import {
  RECURRING_COLLECTION,
  GateValidationError,
  PermitRefusedError,
  PublicGateEntry,
  cleanEmail,
  cleanIdPhoto,
  recurringCheckInById,
} from './gate.service';
import { text } from '../core/input';
import {
  CreateRecurringPassInput,
  RECURRING_CATEGORIES,
  RecurringPassRecord,
} from '../types';

export const MAX_DAYS_SECURITY = 30;
export const MAX_DAYS_ADMIN = 180;
const MIN_DAILY_MINUTES = 60;

export interface PublicRecurringPass {
  id: string;
  passCode: string;
  holderName: string;
  phone: string;
  email: string | null;
  category: string;
  organisation: string | null;
  purpose: string;
  hostName: string | null;
  vehiclePlate: string | null;
  idType: string;
  idLastFour: string | null;
  hasIdPhoto: boolean;
  validFrom: string;
  validUntil: string;
  weekdays: number[];
  dailyStart: string;
  dailyEnd: string;
  schedule: string;
  status: 'active' | 'revoked' | 'expired';
  /** The holder is inside right now. */
  onCampus: boolean;
  lastEntryAt: string | null;
  issuedByEmployeeId: string | null;
  issuedByRole: string | null;
  revokedAt: string | null;
  revokedByEmployeeId: string | null;
  revokeReason: string | null;
  linkedAccountLabel: string | null;
  suggestedAccountLabel: string | null;
  notes: string | null;
  createdAt: string | null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function toPublicRecurring(id: string, r: RecurringPassRecord, now = new Date()): PublicRecurringPass {
  const expired = r.status === 'active' && istDateKey(now) > r.validUntil;
  return {
    id,
    passCode: r.passCode,
    holderName: r.holderName,
    phone: r.phone,
    email: r.email,
    category: r.category,
    organisation: r.organisation,
    purpose: r.purpose,
    hostName: r.hostName,
    vehiclePlate: r.vehiclePlate,
    idType: r.idType,
    idLastFour: r.idLastFour,
    hasIdPhoto: Boolean(r.idImageDataUri),
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    weekdays: r.weekdays,
    dailyStart: r.dailyStart,
    dailyEnd: r.dailyEnd,
    schedule: `${describeWeekdays(r.weekdays)}, ${r.dailyStart}–${r.dailyEnd}`,
    status: expired ? 'expired' : r.status,
    onCampus: Boolean(r.currentEntryId),
    lastEntryAt: toIso(r.lastEntryAt),
    issuedByEmployeeId: r.issuedByEmployeeId,
    issuedByRole: r.issuedByRole,
    revokedAt: toIso(r.revokedAt),
    revokedByEmployeeId: r.revokedByEmployeeId,
    revokeReason: r.revokeReason,
    linkedAccountLabel: r.linkedUserUid ? r.linkedAccountLabel : null,
    suggestedAccountLabel: r.linkedUserUid ? null : r.suggestedAccountLabel,
    notes: r.notes,
    createdAt: toIso(r.createdAt),
  };
}

/** The QR for a recurring pass. Valid to the end of its last day, IST. */
export function recurringToken(id: string, r: RecurringPassRecord): string {
  return issuePass({
    entryId: id,
    passCode: r.passCode,
    visitorName: r.holderName,
    partySize: 1,
    plate: r.vehiclePlate,
    expiresAt: istDayEnd(r.validUntil),
    kind: 'recurring',
  });
}

function validate(input: CreateRecurringPassInput, role: string | null | undefined, now: Date) {
  const holderName = text(input.holderName, 100);
  if (holderName.length < 2) throw new GateValidationError('Enter the pass holder’s name');

  const phone = normalizePhone(String(input.phone || ''));
  if (phone.length !== 10) throw new GateValidationError('Enter a valid 10-digit mobile number');

  const email = cleanEmail(input.email);

  if (!RECURRING_CATEGORIES.includes(input.category)) {
    throw new GateValidationError('Choose what kind of regular visitor this is');
  }

  const purpose = text(input.purpose, 300);
  if (purpose.length < 2) throw new GateValidationError('Enter what they come to campus for');

  const idType = text(input.idType, 60);
  if (!idType) throw new GateValidationError('Select which ID document was checked');

  const idImageDataUri = cleanIdPhoto(input.idImageDataUri);

  // At the gate, the photo is the record that the officer held the document — the same
  // rule as a walk-in. Admin issuing in advance may not have one yet.
  if (role === 'security' && !idImageDataUri) {
    throw new GateValidationError('Photograph the ID document you checked');
  }

  if (!isDateKey(input.validFrom) || !isDateKey(input.validUntil)) {
    throw new GateValidationError('Choose the first and last day of the pass');
  }
  const today = istDateKey(now);
  if (input.validFrom < today) throw new GateValidationError('The pass cannot start in the past');
  if (input.validUntil < input.validFrom) {
    throw new GateValidationError('The last day must be on or after the first day');
  }
  const maxDays = role === 'admin' ? MAX_DAYS_ADMIN : MAX_DAYS_SECURITY;
  if (daysInclusive(input.validFrom, input.validUntil) > maxDays) {
    throw new GateValidationError(
      role === 'admin'
        ? `A pass can run for at most ${MAX_DAYS_ADMIN} days`
        : `Security can issue a pass for at most ${MAX_DAYS_SECURITY} days — ask admin for longer`
    );
  }
  if (input.validFrom > addDays(today, 60)) {
    throw new GateValidationError('A pass can start at most 60 days from today');
  }

  const weekdays = [...new Set((input.weekdays ?? []).map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort();
  if (weekdays.length === 0) throw new GateValidationError('Choose at least one day of the week');

  if (!isTimeOfDay(input.dailyStart) || !isTimeOfDay(input.dailyEnd)) {
    throw new GateValidationError('Choose the daily start and end times');
  }
  if (minutesOfDay(input.dailyEnd) - minutesOfDay(input.dailyStart) < MIN_DAILY_MINUTES) {
    throw new GateValidationError('The daily window must be at least an hour, and end after it starts');
  }

  const plate = text(input.vehiclePlate, 30) ? normalizePlate(text(input.vehiclePlate, 30)) : '';
  if (plate && plate.length < 4) {
    throw new GateValidationError('The number plate looks too short - check and retype it');
  }

  return {
    holderName,
    phone,
    email,
    category: input.category,
    organisation: text(input.organisation, 100) || null,
    purpose,
    hostName: text(input.hostName, 100) || null,
    vehiclePlate: plate || null,
    idType,
    idLastFour: text(input.idLastFour, 10).slice(-4) || null,
    idImageDataUri,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    weekdays,
    dailyStart: input.dailyStart,
    dailyEnd: input.dailyEnd,
    notes: text(input.notes, 500) || null,
  };
}

export interface IssuedRecurringPass {
  pass: PublicRecurringPass;
  passToken: string;
  /** Today's entry, when security issued the pass at the gate and checked the holder in. */
  entry: PublicGateEntry | null;
  /** Why the holder was not checked in now, if that was asked for and not possible. */
  checkInNote: string | null;
}

export async function issueRecurringPass(
  input: CreateRecurringPassInput,
  actor: Actor & { employeeId: string }
): Promise<IssuedRecurringPass> {
  const now = new Date();
  const cleaned = validate(input, actor.role, now);
  const gate = text(input.gate, 60) || null;
  const officer = { uid: actor.uid, employeeId: actor.employeeId };

  const link = await findAccountForPass({ email: cleaned.email, phone: cleaned.phone });
  const watchlist = await screenAtGate(
    { phone: cleaned.phone, plate: cleaned.vehiclePlate, userUid: link.linkedUserUid },
    input.watchlistOverride,
    { visitorName: cleaned.holderName, gate, officer }
  );

  const record: RecurringPassRecord = {
    passCode: generatePassCode(),
    ...cleaned,
    status: 'active',
    currentEntryId: null,
    lastEntryAt: null,
    issuedByUid: actor.uid,
    issuedByEmployeeId: actor.employeeId || null,
    issuedByRole: actor.role ?? null,
    revokedAt: null,
    revokedByEmployeeId: null,
    revokeReason: null,
    linkedUserUid: link.linkedUserUid,
    linkedVia: link.linkedVia,
    linkedAccountLabel: link.linkedAccountLabel,
    suggestedUserUid: link.suggestedUserUid,
    suggestedAccountLabel: link.suggestedAccountLabel,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const db = getFirestore();
  const ref = db.collection(RECURRING_COLLECTION).doc();
  const batch = db.batch();
  batch.set(ref, record);
  auditIn(batch, db, {
    actor,
    action: 'pass.recurring_issue',
    targetType: 'recurring_passes',
    targetId: ref.id,
    summary:
      `Issued a regular pass to ${record.holderName} (${record.category.replace('_', ' ')}` +
      `${record.organisation ? `, ${record.organisation}` : ''}), ` +
      `${record.validFrom} to ${record.validUntil}` +
      (watchlist.overrideReason ? ` — despite a watchlist flag: ${watchlist.overrideReason}` : ''),
    meta: { watchlistMatchIds: watchlist.matches.map((m) => m.id) },
  });
  await batch.commit();

  let entry: PublicGateEntry | null = null;
  let checkInNote: string | null = null;
  if (input.checkInNow) {
    try {
      entry = await recurringCheckInById(ref.id, officer, { gate, screened: watchlist });
    } catch (error) {
      if (!(error instanceof PermitRefusedError)) throw error;
      checkInNote = `Pass issued, but not checked in: ${error.message}`;
    }
  }

  const stored = { ...record, createdAt: now, updatedAt: now } as RecurringPassRecord;
  if (entry) {
    stored.currentEntryId = entry.id;
    stored.lastEntryAt = now;
  }

  return {
    pass: toPublicRecurring(ref.id, stored, now),
    passToken: recurringToken(ref.id, stored),
    entry,
    checkInNote,
  };
}

export async function getRecurringPass(
  id: string
): Promise<{ pass: PublicRecurringPass; passToken: string | null } | null> {
  if (!id || id.includes('/')) return null;
  const snap = await getFirestore().collection(RECURRING_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const record = snap.data() as RecurringPassRecord;
  const pass = toPublicRecurring(id, record);
  return { pass, passToken: pass.status === 'active' ? recurringToken(id, record) : null };
}

export async function getRecurringIdPhoto(id: string) {
  const snap = await getFirestore().collection(RECURRING_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const record = snap.data() as RecurringPassRecord;
  return { holderName: record.holderName, imageDataUri: record.idImageDataUri };
}

export async function listRecurringPasses(options: {
  status?: 'active' | 'revoked' | 'expired';
  q?: string;
}): Promise<PublicRecurringPass[]> {
  const snapshot = await getFirestore()
    .collection(RECURRING_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(1000)
    .get();

  const now = new Date();
  const q = options.q?.trim().toLowerCase();
  const qDigits = q?.replace(/\D/g, '');

  return snapshot.docs
    .map((doc) => toPublicRecurring(doc.id, doc.data() as RecurringPassRecord, now))
    .filter((p) => !options.status || p.status === options.status)
    .filter(
      (p) =>
        !q ||
        p.holderName.toLowerCase().includes(q) ||
        p.passCode.toLowerCase().includes(q) ||
        (p.organisation ?? '').toLowerCase().includes(q) ||
        (qDigits !== undefined && qDigits.length >= 4 && p.phone.includes(qDigits)) ||
        (p.vehiclePlate ?? '').toLowerCase().includes(q.replace(/[^a-z0-9]/g, ''))
    );
}

export async function revokeRecurringPass(
  id: string,
  reasonRaw: string,
  actor: Actor
): Promise<PublicRecurringPass> {
  const reason = (reasonRaw || '').trim();
  if (reason.length < 5) throw new GateValidationError('Give a reason for revoking the pass');

  const db = getFirestore();
  const ref = db.collection(RECURRING_COLLECTION).doc(id);

  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new PermitRefusedError('not_found', 'Pass not found');
    const record = snap.data() as RecurringPassRecord;
    if (record.status === 'revoked') {
      throw new GateValidationError('This pass has already been revoked');
    }

    // A holder who is inside when the pass is revoked can still be scanned out: exits
    // follow the open gate entry, not the pass's status.
    const changes = {
      status: 'revoked' as const,
      revokedAt: Timestamp.now(),
      revokedByEmployeeId: actor.employeeId || null,
      revokeReason: reason.slice(0, 500),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.update(ref, changes);
    auditIn(tx, db, {
      actor,
      action: 'pass.recurring_revoke',
      targetType: 'recurring_passes',
      targetId: id,
      summary: `Revoked ${record.holderName}'s regular pass: ${reason}`,
    });
    return { ...record, ...changes } as RecurringPassRecord;
  });

  return toPublicRecurring(id, { ...updated, updatedAt: new Date() });
}

export async function linkRecurringToSuggestedAccount(id: string, actor: Actor) {
  return confirmSuggestedLink(RECURRING_COLLECTION, id, actor);
}

/** Active recurring passes sent to this visitor's account, each with its QR. */
export async function listLinkedRecurring(
  uid: string
): Promise<{ pass: PublicRecurringPass; passToken: string | null }[]> {
  const snapshot = await getFirestore()
    .collection(RECURRING_COLLECTION)
    .where('linkedUserUid', '==', uid)
    .limit(20)
    .get();

  const now = new Date();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, record: doc.data() as RecurringPassRecord }))
    .map(({ id, record }) => {
      const pass = toPublicRecurring(id, record, now);
      return { pass, passToken: pass.status === 'active' ? recurringToken(id, record) : null };
    })
    .filter(({ pass }) => pass.status === 'active');
}

