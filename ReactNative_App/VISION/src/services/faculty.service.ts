/**
 * Faculty Service
 *
 * The faculty directory — who a visitor can ask to visit — fetched from Node_Backend
 * (/api/faculty) and cached here for search and paging.
 *
 * This used to read the `faculty` collection directly. Those documents also hold each
 * faculty member's password hash and lockout counters, so a direct read exposed them to
 * any client. The API returns only the fields below.
 */

import { facultyAPI } from '@/services/api.service';
import { firebaseAuth } from '@/services/firebase.auth';

export interface FacultyMember {
  id: string;
  username: string;
  name: string;
  email: string;
  department: string;
  designation?: string;
  employeeId?: string;
  isMentor?: boolean;
  photoURL?: string; // Official Firestore field
  photoUri?: string; // Legacy/fallback (always set: falls back to a generated avatar)
  status?: string;
}

// Pagination state
const PAGE_SIZE = 50;
let allFacultyCache: FacultyMember[] = [];
let nextCursor: string | null = null;
let hasMoreData = true;
let isLoadingMore = false;

async function token(): Promise<string> {
  const idToken = await firebaseAuth.getIdToken();
  if (!idToken) throw new Error('You are signed out. Sign in again to continue.');
  return idToken;
}

function toMember(raw: any): FacultyMember {
  const photo = raw.photoURL || undefined;
  return {
    id: raw.id,
    username: raw.username || raw.id,
    name: raw.name || 'Unknown Faculty',
    email: raw.email || '',
    department: raw.department || 'Unknown Department',
    designation: raw.designation || 'Faculty Member',
    employeeId: raw.employeeId || '',
    isMentor: Boolean(raw.isMentor),
    photoURL: photo,
    photoUri:
      photo ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(raw.name || 'Faculty')}&background=1e3a8a&color=fff`,
    status: raw.status || 'active',
  };
}

async function fetchPage(cursor: string | null): Promise<FacultyMember[]> {
  const result = await facultyAPI.page(await token(), cursor ?? undefined, PAGE_SIZE);
  if (!result.success) {
    throw new Error(result.message || result.error || 'Could not load faculty');
  }

  nextCursor = result.data?.nextCursor ?? null;
  hasMoreData = nextCursor !== null;
  return (result.data?.faculty ?? []).map(toMember);
}

/**
 * Fetch the first page of faculty, resetting the cache.
 */
export async function getInitialFaculty(): Promise<FacultyMember[]> {
  allFacultyCache = [];
  nextCursor = null;
  hasMoreData = true;

  allFacultyCache = await fetchPage(null);
  return allFacultyCache;
}

/**
 * Load the next page and return the whole cache.
 */
export async function loadMoreFaculty(): Promise<FacultyMember[]> {
  if (!hasMoreData || isLoadingMore) {
    return allFacultyCache;
  }

  try {
    isLoadingMore = true;
    const page = await fetchPage(nextCursor);
    const known = new Set(allFacultyCache.map((f) => f.id));
    allFacultyCache = [...allFacultyCache, ...page.filter((f) => !known.has(f.id))];
    return allFacultyCache;
  } finally {
    isLoadingMore = false;
  }
}

/**
 * Get all cached faculty (for search/filter)
 */
export function getCachedFaculty(): FacultyMember[] {
  return allFacultyCache;
}

/**
 * Check if more data is available
 */
export function hasMore(): boolean {
  return hasMoreData;
}

/**
 * Check if currently loading more
 */
export function isLoading(): boolean {
  return isLoadingMore;
}

/**
 * Search the whole directory on the server — name, department, designation, email or
 * employee ID. Needs at least 2 characters.
 */
export async function searchFacultyInDB(searchQuery: string): Promise<FacultyMember[]> {
  if (!searchQuery || searchQuery.trim().length < 2) {
    return [];
  }

  const result = await facultyAPI.search(await token(), searchQuery.trim());
  if (!result.success) {
    throw new Error(result.message || result.error || 'Search failed');
  }

  return (result.data?.faculty ?? []).map(toMember);
}

/**
 * The signed-in faculty member's own directory record, or null if the account isn't
 * linked to one.
 */
export async function getMyFacultyProfile(): Promise<FacultyMember | null> {
  const result = await facultyAPI.me(await token());
  if (!result.success) {
    if (result.status === 404) return null;
    throw new Error(result.message || result.error || 'Could not load your profile');
  }
  return toMember(result.data.faculty);
}

/**
 * Get faculty by username
 *
 * @param username - Faculty username
 * @returns Faculty member or null
 */
export function getFacultyByUsername(username: string): FacultyMember | null {
  return allFacultyCache.find((f) => f.username === username) || null;
}

/**
 * Get faculty by department
 *
 * @param department - Department name
 * @returns Faculty members in department
 */
export function getFacultyByDepartment(department: string): FacultyMember[] {
  return allFacultyCache.filter((f) =>
    f.department.toLowerCase().includes(department.toLowerCase())
  );
}

/**
 * Get mentors only
 *
 * @returns Faculty members who are mentors
 */
export function getMentors(): FacultyMember[] {
  return allFacultyCache.filter((f) => f.isMentor === true);
}

/**
 * Clear faculty cache and reset pagination
 */
export function clearFacultyCache(): void {
  allFacultyCache = [];
  nextCursor = null;
  hasMoreData = true;
  isLoadingMore = false;
}

/**
 * Get cache info (for debugging)
 */
export function getCacheInfo() {
  return {
    count: allFacultyCache.length,
    hasMore: hasMoreData,
    isLoading: isLoadingMore,
  };
}
