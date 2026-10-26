/**
 * Admin console data: the overview, and requester account management (PRD.md FR-ADM-01).
 *
 * Staff accounts are managed by staff.service; this covers the self-registered accounts —
 * visitors, parents, students — which an admin can view, suspend and reactivate.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth, getFirestore } from '../config/firebase.admin';
import { istDateKey, istDayEnd, istDayStart } from '../core/ist';
import { Actor, recordAudit } from './audit.service';
import { listAlerts, listEvents, PublicAlert } from './gate-log.service';
import { listOnCampus, PublicGateEntry } from './gate.service';
import { listRecurringPasses } from './recurring.service';
import { VISITS_COLLECTION } from './visit.service';

const USERS_COLLECTION = process.env.FIRESTORE_COLLECTION_USERS || 'users';
const REQUESTER_ROLES = ['visitor', 'parent', 'student'];

export class AdminConsoleError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'AdminConsoleError';
  }
}

// =========================================
// Overview
// =========================================

export interface AdminOverview {
  date: string;
  onCampus: { visits: number; people: number };
  today: { entries: number; exits: number; denials: number; people: number };
  overstays: PublicGateEntry[];
  alerts: PublicAlert[];
  activeRegularPasses: number;
  pendingVisitRequests: number;
}

export async function getOverview(now = new Date()): Promise<AdminOverview> {
  const date = istDateKey(now);
  const [inside, events, alerts, regular, pending] = await Promise.all([
    listOnCampus(500),
    listEvents({ from: istDayStart(date), to: istDayEnd(date), limit: 5000 }),
    listAlerts({ limit: 20 }),
    listRecurringPasses({ status: 'active' }),
    getFirestore().collection(VISITS_COLLECTION).where('status', '==', 'pending').count().get(),
  ]);

  const entries = events.filter((e) => e.type === 'entry');
  return {
    date,
    onCampus: {
      visits: inside.length,
      people: inside.reduce((total, e) => total + e.partySize, 0),
    },
    today: {
      entries: entries.length,
      exits: events.filter((e) => e.type === 'exit').length,
      denials: events.filter((e) => e.type === 'denied').length,
      people: entries.reduce((total, e) => total + e.partySize, 0),
    },
    overstays: inside.filter((e) => e.overstay).sort((a, b) => b.overstayMinutes - a.overstayMinutes),
    alerts,
    activeRegularPasses: regular.length,
    pendingVisitRequests: pending.data().count,
  };
}

// =========================================
// Requester accounts
// =========================================

export interface PublicRequester {
  uid: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  visitorSubtype: string | null;
  status: string;
  emailVerified: boolean;
  profileComplete: boolean;
  biometricEnrolled: boolean;
  govtIdUploaded: boolean;
  createdAt: string | null;
  suspendedReason: string | null;
}

/** Allow-listed: never the ID document, the biometric data or the profile photo. */
function toRequester(uid: string, d: FirebaseFirestore.DocumentData): PublicRequester {
  return {
    uid,
    name: [d.firstName, d.lastName].filter(Boolean).join(' ').trim() || d.displayName || '',
    email: d.email || '',
    phone: d.phone || null,
    role: d.role || 'visitor',
    visitorSubtype: d.visitorSubtype || null,
    status: d.status || 'active',
    emailVerified: Boolean(d.emailVerified),
    profileComplete: Boolean(d.profileComplete),
    biometricEnrolled: Boolean(d.biometricEnrolled),
    govtIdUploaded: Boolean(d.govtIdUploaded || d.identityProof),
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate().toISOString() : null,
    suspendedReason: d.suspendedReason || null,
  };
}

export async function listRequesters(options: { q?: string; status?: string }): Promise<PublicRequester[]> {
  const snapshot = await getFirestore()
    .collection(USERS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(1000)
    .get();

  const q = options.q?.trim().toLowerCase();
  return snapshot.docs
    .map((doc) => toRequester(doc.id, doc.data()))
    .filter((u) => REQUESTER_ROLES.includes(u.role))
    .filter((u) => !options.status || u.status === options.status)
    .filter(
      (u) =>
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000')
    )
    .slice(0, 300);
}

/**
 * Suspend or reactivate a requester. Suspending disables the Firebase account and revokes
 * its sessions, so the next request fails (tokens are checked for revocation); the profile
 * is kept, with the reason, so the history stays attributable.
 */
export async function setRequesterSuspended(
  uid: string,
  suspended: boolean,
  reasonRaw: string,
  actor: Actor
): Promise<PublicRequester> {
  const reason = (reasonRaw || '').trim();
  if (suspended && reason.length < 5) {
    throw new AdminConsoleError('Give a reason for the suspension (at least 5 characters)');
  }

  const ref = getFirestore().collection(USERS_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminConsoleError('Account not found', 404);
  const data = snap.data()!;
  if (!REQUESTER_ROLES.includes(data.role || 'visitor')) {
    throw new AdminConsoleError('Staff accounts are managed on the Staff screen', 409);
  }

  await getAuth().updateUser(uid, { disabled: suspended });
  if (suspended) await getAuth().revokeRefreshTokens(uid);

  const changes = {
    status: suspended ? 'suspended' : 'active',
    suspendedReason: suspended ? reason.slice(0, 500) : null,
    suspendedAt: suspended ? Timestamp.now() : null,
    suspendedByEmployeeId: suspended ? actor.employeeId || null : null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.update(changes);

  const requester = toRequester(uid, { ...data, ...changes });
  await recordAudit({
    actor,
    action: suspended ? 'user.suspend' : 'user.reactivate',
    targetType: 'users',
    targetId: uid,
    summary: suspended
      ? `Suspended ${requester.name || requester.email}: ${reason}`
      : `Reactivated ${requester.name || requester.email}${reason ? `: ${reason}` : ''}`,
  });

  return requester;
}
