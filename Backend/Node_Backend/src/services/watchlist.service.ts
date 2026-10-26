/**
 * Watchlist (PRD.md FR-TRU-01, FR-ENT-08).
 *
 * A flag on a person or vehicle — by phone number, number plate or VISION account — with a
 * reason. When anyone matching an active flag is registered or checked in at the gate, the
 * officer gets a red alert and decides: turn them away (logged), or admit them with a
 * written reason (logged, and raised to admin). The system does not silently refuse, because
 * a phone number or plate can be shared, and the officer is the one looking at the person.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase.admin';
import { normalizePhone } from '../core/phone';
import { normalizePlate } from '../core/plate';
import { Actor, recordAudit } from './audit.service';
import { raiseAlert } from './gate-log.service';

export const WATCHLIST_COLLECTION = process.env.FIRESTORE_COLLECTION_WATCHLIST || 'watchlist';

/** The shortest written reason accepted for admitting someone on the watchlist. */
export const MIN_OVERRIDE_REASON = 10;

export class WatchlistError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'WatchlistError';
  }
}

export interface WatchlistMatch {
  id: string;
  name: string;
  reason: string;
  matchedOn: ('phone' | 'plate' | 'account')[];
}

/**
 * Thrown by a gate action when the subject matches the watchlist and the officer has not
 * yet decided. Carries the matches so the app can show who and why.
 */
export class WatchlistHitError extends Error {
  statusCode = 409;
  constructor(public matches: WatchlistMatch[], message = 'This person or vehicle is on the watchlist') {
    super(message);
    this.name = 'WatchlistHitError';
  }
}

export interface WatchlistOverrideInput {
  reason: string;
}

export interface PublicWatchlistEntry {
  id: string;
  name: string;
  phone: string | null;
  plate: string | null;
  userUid: string | null;
  reason: string;
  active: boolean;
  addedByEmployeeId: string | null;
  addedAt: string | null;
  clearedByEmployeeId: string | null;
  clearedAt: string | null;
  clearReason: string | null;
}

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function toPublic(id: string, d: FirebaseFirestore.DocumentData): PublicWatchlistEntry {
  return {
    id,
    name: d.name,
    phone: d.phone ?? null,
    plate: d.plate ?? null,
    userUid: d.userUid ?? null,
    reason: d.reason,
    active: Boolean(d.active),
    addedByEmployeeId: d.addedByEmployeeId ?? null,
    addedAt: toIso(d.addedAt),
    clearedByEmployeeId: d.clearedByEmployeeId ?? null,
    clearedAt: toIso(d.clearedAt),
    clearReason: d.clearReason ?? null,
  };
}

export async function addToWatchlist(
  input: { name?: string; phone?: string; plate?: string; userUid?: string; reason?: string },
  actor: Actor
): Promise<PublicWatchlistEntry> {
  const name = (input.name || '').trim();
  const reason = (input.reason || '').trim();
  const phone = input.phone ? normalizePhone(input.phone) : '';
  const plate = input.plate ? normalizePlate(input.plate) : '';
  const userUid = (input.userUid || '').trim();

  if (name.length < 2) throw new WatchlistError('Enter the name of the person');
  if (reason.length < 5) throw new WatchlistError('Give a reason (at least 5 characters)');
  if (phone && phone.length !== 10) throw new WatchlistError('Enter a valid 10-digit mobile number');
  if (plate && plate.length < 4) throw new WatchlistError('The number plate looks too short');
  if (!phone && !plate && !userUid) {
    throw new WatchlistError('Give a phone number or a number plate to match at the gate');
  }

  const record = {
    name: name.slice(0, 100),
    phone: phone || null,
    plate: plate || null,
    userUid: userUid || null,
    reason: reason.slice(0, 500),
    active: true,
    addedByUid: actor.uid,
    addedByEmployeeId: actor.employeeId || null,
    addedAt: FieldValue.serverTimestamp(),
    clearedByUid: null,
    clearedByEmployeeId: null,
    clearedAt: null,
    clearReason: null,
  };

  const ref = getFirestore().collection(WATCHLIST_COLLECTION).doc();
  await ref.set(record);

  await recordAudit({
    actor,
    action: 'watchlist.add',
    targetType: 'watchlist',
    targetId: ref.id,
    summary: `Added ${record.name} to the watchlist: ${record.reason}`,
    meta: { phone: record.phone, plate: record.plate },
  });

  return toPublic(ref.id, { ...record, addedAt: Timestamp.now() });
}

export async function clearWatchlistEntry(
  id: string,
  reasonRaw: string,
  actor: Actor
): Promise<PublicWatchlistEntry> {
  const reason = (reasonRaw || '').trim();
  if (reason.length < 5) throw new WatchlistError('Give a reason for clearing the flag');

  const db = getFirestore();
  const ref = db.collection(WATCHLIST_COLLECTION).doc(id);

  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new WatchlistError('Watchlist entry not found', 404);
    const d = snap.data()!;
    if (!d.active) throw new WatchlistError('This flag has already been cleared', 409);

    const changes = {
      active: false,
      clearedByUid: actor.uid,
      clearedByEmployeeId: actor.employeeId || null,
      clearedAt: Timestamp.now(),
      clearReason: reason.slice(0, 500),
    };
    tx.update(ref, changes);
    return { ...d, ...changes } as FirebaseFirestore.DocumentData;
  });

  await recordAudit({
    actor,
    action: 'watchlist.clear',
    targetType: 'watchlist',
    targetId: id,
    summary: `Cleared watchlist flag on ${updated.name}: ${reason}`,
  });

  return toPublic(id, updated);
}

export async function listWatchlist(activeOnly: boolean): Promise<PublicWatchlistEntry[]> {
  const snapshot = await getFirestore()
    .collection(WATCHLIST_COLLECTION)
    .orderBy('addedAt', 'desc')
    .limit(500)
    .get();

  return snapshot.docs
    .map((doc) => toPublic(doc.id, doc.data()))
    .filter((entry) => !activeOnly || entry.active);
}

/** Active flags matching any of the given identifiers. */
export async function checkWatchlist(subject: {
  phone?: string | null;
  plate?: string | null;
  userUid?: string | null;
}): Promise<WatchlistMatch[]> {
  const collection = getFirestore().collection(WATCHLIST_COLLECTION);
  const phone = subject.phone ? normalizePhone(subject.phone) : '';
  const plate = subject.plate ? normalizePlate(subject.plate) : '';

  const lookups: [WatchlistMatch['matchedOn'][number], Promise<FirebaseFirestore.QuerySnapshot>][] = [];
  if (phone.length === 10) lookups.push(['phone', collection.where('phone', '==', phone).get()]);
  if (plate.length >= 4) lookups.push(['plate', collection.where('plate', '==', plate).get()]);
  if (subject.userUid) lookups.push(['account', collection.where('userUid', '==', subject.userUid).get()]);

  const matches = new Map<string, WatchlistMatch>();
  for (const [on, pending] of lookups) {
    const snapshot = await pending;
    for (const doc of snapshot.docs) {
      const d = doc.data();
      if (!d.active) continue;
      const existing = matches.get(doc.id);
      if (existing) existing.matchedOn.push(on);
      else matches.set(doc.id, { id: doc.id, name: d.name, reason: d.reason, matchedOn: [on] });
    }
  }
  return [...matches.values()];
}

/**
 * The gate's watchlist step. No match: nothing to do. A match without an override: raise
 * the alert and stop, so the app can ask the officer. A match with an override: check the
 * reason and let the caller record it with the entry.
 */
export async function screenAtGate(
  subject: { phone?: string | null; plate?: string | null; userUid?: string | null },
  override: WatchlistOverrideInput | undefined | null,
  context: { visitorName: string; gate: string | null; officer: { uid: string; employeeId: string } }
): Promise<{ matches: WatchlistMatch[]; overrideReason: string | null }> {
  const matches = await checkWatchlist(subject);
  if (matches.length === 0) return { matches, overrideReason: null };

  const reason = typeof override?.reason === 'string' ? override.reason.trim() : '';

  if (!override) {
    await raiseAlert({
      type: 'watchlist_hit',
      visitorName: context.visitorName,
      phone: subject.phone ? normalizePhone(subject.phone) : null,
      plate: subject.plate ? normalizePlate(subject.plate) : null,
      gate: context.gate,
      officer: context.officer,
      matches,
    });
    throw new WatchlistHitError(matches);
  }

  if (reason.length < MIN_OVERRIDE_REASON) {
    throw new WatchlistHitError(
      matches,
      `Write why you are admitting them (at least ${MIN_OVERRIDE_REASON} characters)`
    );
  }

  return { matches, overrideReason: reason.slice(0, 500) };
}
