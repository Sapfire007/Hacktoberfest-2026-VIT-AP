/**
 * Faculty Directory Service
 *
 * Read access to the `faculty` collection for the rest of the app: the directory a
 * visitor picks a host from, and the mapping from a signed-in faculty account to its
 * faculty record.
 *
 * The app used to read this collection straight from Firestore. Those documents also hold
 * `passwordHash`, failed-attempt counters and the auth uid, so a direct read handed every
 * faculty member's password hash to anyone holding the app's (public) Firebase config.
 * Everything here goes through `toPublic`, an explicit allow-list — a field added to the
 * collection later stays private unless someone adds it here on purpose.
 *
 * The directory is cached in memory for a few minutes. It changes rarely (an import when
 * faculty are onboarded), is read on every host search, and a campus has a few hundred
 * faculty at most — so one collection read per few minutes replaces one per keystroke.
 */

import { getFirestore } from '../config/firebase.admin';
import { PublicFaculty } from '../types';

const FACULTY_COLLECTION = process.env.FIRESTORE_COLLECTION_FACULTY || 'faculty';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { at: number; faculty: PublicFaculty[] } | null = null;

function toPublic(id: string, data: Record<string, any>): PublicFaculty {
  return {
    id,
    username: data.username || id,
    name: data.name || 'Unknown Faculty',
    email: data.email || '',
    department: data.department || '',
    designation: data.designation || 'Faculty Member',
    employeeId: data.employeeId || '',
    isMentor: Boolean(data.isMentor),
    photoURL: data.photoURL || data.photoUri || null,
    status: data.status || 'active',
  };
}

/** Every active faculty member, sorted by name. Cached. */
async function listActiveFaculty(): Promise<PublicFaculty[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.faculty;
  }

  const snapshot = await getFirestore()
    .collection(FACULTY_COLLECTION)
    .where('status', '==', 'active')
    .get();

  const faculty = snapshot.docs
    .map((doc) => toPublic(doc.id, doc.data()))
    .sort((a, b) => a.name.localeCompare(b.name));

  cache = { at: Date.now(), faculty };
  return faculty;
}

/** Drop the cache — call after importing or editing faculty. */
function invalidateFacultyCache(): void {
  cache = null;
}

/**
 * One page of the directory. `cursor` is the id of the last item already shown; paging
 * by id rather than offset keeps pages stable if the cache refreshes between requests.
 */
async function getFacultyPage(
  cursor: string | undefined,
  limit: number
): Promise<{ faculty: PublicFaculty[]; nextCursor: string | null }> {
  const all = await listActiveFaculty();
  const start = cursor ? all.findIndex((f) => f.id === cursor) + 1 : 0;
  const page = all.slice(start, start + limit);
  const hasMore = start + limit < all.length;

  return { faculty: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
}

/** Substring match on name, department, designation, email or employee ID. */
async function searchFaculty(query: string, limit = 50): Promise<PublicFaculty[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const all = await listActiveFaculty();
  return all
    .filter((f) =>
      [f.name, f.department, f.designation, f.email, f.employeeId, f.username].some((field) =>
        field.toLowerCase().includes(needle)
      )
    )
    .slice(0, limit);
}

/** A single faculty member by document id, active or not. Uncached — used when writing. */
async function getFacultyById(id: string): Promise<PublicFaculty | null> {
  if (!id || id.includes('/')) return null;

  const doc = await getFirestore().collection(FACULTY_COLLECTION).doc(id).get();
  return doc.exists ? toPublic(doc.id, doc.data()!) : null;
}

/**
 * The faculty record belonging to a signed-in faculty account.
 *
 * Resolved on the server from the verified token, so which requests a faculty member can
 * see and approve never depends on an id the app sends. 
 * 
 * Three lookup strategies in order:
 * 1. By `uid` field (set by `ensureFacultyAuthUser` in staff.service or migration)
 * 2. By `employeeId` claim as document ID (legacy fallback, most reliable)
 * 3. By synthetic UID pattern matching (facultyuid → document ID)
 * 
 * Note: Firebase Auth users for faculty have NO email for security reasons,
 * so we cannot use email-based lookup. Instead, the employeeId claim (which
 * matches the faculty document ID) is the reliable fallback.
 */
async function resolveFacultyForUser(
  uid: string,
  employeeIdClaim?: string
): Promise<PublicFaculty | null> {
  const collection = getFirestore().collection(FACULTY_COLLECTION);

  // Strategy 1: Lookup by uid field (most reliable when set)
  const byUid = await collection.where('uid', '==', uid).limit(1).get();
  if (!byUid.empty) {
    const doc = byUid.docs[0];
    return toPublic(doc.id, doc.data());
  }

  // Strategy 2: employeeId claim as document ID (legacy fallback, works even without uid field)
  if (employeeIdClaim) {
    const faculty = await getFacultyById(employeeIdClaim.toLowerCase());
    if (faculty) return faculty;
  }

  // Strategy 3: Extract document ID from synthetic uid pattern (faculty_username)
  if (uid.startsWith('faculty_')) {
    const docId = uid.substring('faculty_'.length);
    const faculty = await getFacultyById(docId);
    if (faculty) return faculty;
  }

  return null;
}

export {
  listActiveFaculty,
  getFacultyPage,
  searchFaculty,
  getFacultyById,
  resolveFacultyForUser,
  invalidateFacultyCache,
};
