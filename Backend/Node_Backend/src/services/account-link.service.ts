/**
 * Sending a gate pass to the visitor's own VISION account.
 *
 * When security registers someone who already has an account, the QR should also appear
 * in their app, so a lost paper slip or a screenshot on someone else's phone stops
 * mattering. The question is which account is theirs:
 *
 *   - **Email** is the primary key, and links automatically — but only to an account whose
 *     email is *verified*. Anyone can sign up with any address; an unverified account
 *     proves nothing about who owns it, and linking to one would hand the pass to whoever
 *     typed the visitor's email first.
 *   - **Phone** is a secondary hint. Profile phone numbers are not verified at all, so a
 *     phone match is never linked automatically: it is offered to the officer, who has the
 *     visitor in front of them and confirms with a tap.
 *
 * Only visitor and parent accounts receive passes; staff and students are not gate-tracked.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getAuth, getFirestore } from '../config/firebase.admin';
import { normalizePhone } from '../core/phone';
import { Actor, recordAudit } from './audit.service';

const USERS_COLLECTION = process.env.FIRESTORE_COLLECTION_USERS || 'users';
const PASS_ROLES = ['visitor', 'parent'];

export interface AccountLink {
  linkedUserUid: string | null;
  linkedVia: 'email' | 'phone' | null;
  /** What the officer sees for a linked account — masked. */
  linkedAccountLabel: string | null;
  suggestedUserUid: string | null;
  suggestedAccountLabel: string | null;
}

export const NO_LINK: AccountLink = {
  linkedUserUid: null,
  linkedVia: null,
  linkedAccountLabel: null,
  suggestedUserUid: null,
  suggestedAccountLabel: null,
};

/** "saury@gmail.com" -> "s****@gmail.com". Enough to confirm, not enough to harvest. */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(3, local.length - 1))}@${domain}`;
}

/** "Asha Kumari" -> "A*** K". */
export function maskName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .map((part, index) => (index === 0 ? `${part[0]}${'*'.repeat(Math.max(2, part.length - 1))}` : part[0]))
    .join(' ');
}

function profileName(d: FirebaseFirestore.DocumentData): string {
  return [d.firstName, d.lastName].filter(Boolean).join(' ').trim() || d.displayName || '';
}

function phoneVariants(phone: string): string[] {
  const d = normalizePhone(phone);
  if (d.length !== 10) return [];
  return [d, `+91${d}`, `91${d}`, `+91 ${d}`, `0${d}`, `+91-${d}`];
}

export async function findAccountForPass(contact: {
  email?: string | null;
  phone?: string | null;
}): Promise<AccountLink> {
  const email = (contact.email || '').trim().toLowerCase();

  if (email) {
    try {
      const record = await getAuth().getUserByEmail(email);
      const role = record.customClaims?.role as string | undefined;
      if (record.emailVerified && !record.disabled && role && PASS_ROLES.includes(role)) {
        return {
          ...NO_LINK,
          linkedUserUid: record.uid,
          linkedVia: 'email',
          linkedAccountLabel: maskEmail(record.email),
        };
      }
    } catch (error) {
      // auth/user-not-found is the ordinary case: the visitor has no account.
      if ((error as { code?: string }).code !== 'auth/user-not-found') {
        console.warn('Account lookup by email failed:', (error as Error).message);
      }
    }
  }

  const variants = contact.phone ? phoneVariants(contact.phone) : [];
  if (variants.length > 0) {
    const snapshot = await getFirestore()
      .collection(USERS_COLLECTION)
      .where('phone', 'in', variants)
      .limit(5)
      .get();

    const candidates = snapshot.docs.filter((doc) => {
      const d = doc.data();
      return PASS_ROLES.includes(d.role) && d.status !== 'suspended';
    });

    // Two accounts on one number is ambiguous; suggesting either could be wrong.
    if (candidates.length === 1) {
      const d = candidates[0].data();
      return {
        ...NO_LINK,
        suggestedUserUid: candidates[0].id,
        suggestedAccountLabel: [maskName(profileName(d)), maskEmail(d.email)].filter(Boolean).join(' · '),
      };
    }
  }

  return NO_LINK;
}

export class AccountLinkError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'AccountLinkError';
  }
}

/**
 * The officer confirms a phone-number suggestion. Works on any document carrying the
 * AccountLink fields (a gate entry or a recurring pass).
 */
export async function confirmSuggestedLink(
  collection: string,
  docId: string,
  actor: Actor
): Promise<{ linkedAccountLabel: string | null }> {
  const db = getFirestore();
  const ref = db.collection(collection).doc(docId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AccountLinkError('Pass not found', 404);
    const d = snap.data()!;
    if (d.linkedUserUid) throw new AccountLinkError('This pass is already in an account', 409);
    if (!d.suggestedUserUid) throw new AccountLinkError('There is no matching account to send it to', 409);

    const label = d.suggestedAccountLabel ?? null;
    tx.update(ref, {
      linkedUserUid: d.suggestedUserUid,
      linkedVia: 'phone',
      linkedAccountLabel: label,
      suggestedUserUid: null,
      suggestedAccountLabel: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { label, name: d.visitorName || d.holderName || '', uid: d.suggestedUserUid as string };
  });

  await recordAudit({
    actor,
    action: 'pass.account_link',
    targetType: collection,
    targetId: docId,
    summary: `Sent ${result.name}'s pass to their VISION account (matched by phone)`,
    meta: { userUid: result.uid },
  });

  return { linkedAccountLabel: result.label };
}
