/**
 * Admin API — the admin console's calls to Node_Backend (/api/admin, /api/passes).
 *
 * Every call carries the admin's ID token; the backend checks the `admin` role claim on
 * each one. Nothing here decides what an admin may do.
 */

import { Linking, Platform } from 'react-native';
import {
  request,
  GateEntry,
  RecurringPass,
  RecurringPassInput,
  WatchlistMatch,
} from '@/services/gate.api';

export interface GateEvent {
  id: string;
  type: 'entry' | 'exit' | 'denied';
  entryId: string | null;
  recurringPassId: string | null;
  visitRequestId: string | null;
  passCode: string | null;
  visitorName: string;
  phone: string | null;
  partySize: number;
  plate: string | null;
  gate: string | null;
  source: 'walkin' | 'permit' | 'recurring' | null;
  officerEmployeeId: string;
  flagged: boolean;
  note: string | null;
  at: string | null;
}

export interface SecurityAlert {
  id: string;
  type: 'watchlist_hit' | 'watchlist_override' | 'watchlist_denied';
  visitorName: string;
  phone: string | null;
  plate: string | null;
  gate: string | null;
  officerEmployeeId: string;
  matches: WatchlistMatch[];
  reason: string | null;
  entryId: string | null;
  at: string | null;
}

export interface AdminOverview {
  date: string;
  onCampus: { visits: number; people: number };
  today: { entries: number; exits: number; denials: number; people: number };
  overstays: GateEntry[];
  alerts: SecurityAlert[];
  activeRegularPasses: number;
  pendingVisitRequests: number;
}

export interface Analytics {
  range: { from: string; to: string; days: number };
  totals: {
    visits: number;
    people: number;
    uniqueVisitors: number;
    exited: number;
    stillInside: number;
    overstaysNow: number;
    vehicles: number;
  };
  byDay: { date: string; visits: number; people: number }[];
  byHour: { hour: number; visits: number }[];
  peakHours: { hour: number; visits: number }[];
  byGate: { gate: string; visits: number }[];
  bySource: { source: string; visits: number }[];
  byCategory: { category: string; visits: number }[];
  duration: {
    averageMinutes: number | null;
    medianMinutes: number | null;
    p90Minutes: number | null;
    measured: number;
  };
  ocr: {
    vehicles: number;
    manual: number;
    acceptedAsRead: number;
    corrected: number;
    acceptanceRate: number | null;
    meanConfidence: number | null;
  };
  watchlist: { hits: number; overrides: number; denials: number };
  truncated: boolean;
}

export interface StaffAccount {
  employeeId: string;
  uid: string;
  role: 'faculty' | 'security' | 'admin';
  displayName: string;
  department: string | null;
  email: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface RequesterAccount {
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

export interface WatchlistEntry {
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

export interface AuditRow {
  id: string;
  actorEmployeeId: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  at: string | null;
}

export type ReportKind = 'register-csv' | 'register-pdf' | 'log-csv';

function qs(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Validation errors from express-validator arrive as `errors: [{ msg }]`. */
export function firstError(result: { error?: string; message?: string; errors?: { msg: string }[] }): string {
  return result.errors?.[0]?.msg || result.message || result.error || 'Something went wrong';
}

export const adminAPI = {
  overview: (t: string) => request<AdminOverview>('/admin/overview', t),

  events: (t: string, p: { from?: string; to?: string; type?: string; gate?: string; q?: string }) =>
    request<{ range: { from: string; to: string }; events: GateEvent[] }>(`/admin/gate/events${qs(p)}`, t),

  entries: (t: string, p: { from?: string; to?: string; status?: string; source?: string; q?: string }) =>
    request<{ range: { from: string; to: string }; entries: GateEntry[] }>(`/admin/gate/entries${qs(p)}`, t),

  entry: (t: string, id: string) =>
    request<{ entry: GateEntry; events: GateEvent[] }>(`/admin/gate/entries/${id}`, t),

  entryIdPhoto: (t: string, id: string) =>
    request<{ visitorName: string; imageDataUri: string | null; storageUri: string | null }>(
      `/admin/gate/entries/${id}/id-photo`,
      t
    ),

  analytics: (t: string, from: string, to: string) =>
    request<Analytics>(`/admin/analytics${qs({ from, to })}`, t),

  reportLink: (t: string, kind: ReportKind, from: string, to?: string) =>
    request<{ url: string; filename: string; expiresInSeconds: number }>('/admin/reports/link', t, {
      method: 'POST',
      body: JSON.stringify({ kind, from, to }),
    }),

  // ---- staff ----
  staff: (t: string) => request<{ staff: StaffAccount[]; total: number }>('/admin/staff', t),
  createStaff: (
    t: string,
    body: { employeeId: string; password: string; role: string; displayName: string; department?: string; email?: string }
  ) => request<{ staff: StaffAccount }>('/admin/staff', t, { method: 'POST', body: JSON.stringify(body) }),
  resetStaffPassword: (t: string, employeeId: string, newPassword: string) =>
    request<unknown>(`/admin/staff/${encodeURIComponent(employeeId)}/reset-password`, t, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
  setStaffActive: (t: string, employeeId: string, active: boolean) =>
    request<unknown>(`/admin/staff/${encodeURIComponent(employeeId)}`, t, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),

  // ---- requester accounts ----
  users: (t: string, p: { q?: string; status?: string }) =>
    request<{ users: RequesterAccount[] }>(`/admin/users${qs(p)}`, t),
  suspendUser: (t: string, uid: string, reason: string) =>
    request<{ user: RequesterAccount }>(`/admin/users/${uid}/suspend`, t, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  reactivateUser: (t: string, uid: string, reason: string) =>
    request<{ user: RequesterAccount }>(`/admin/users/${uid}/reactivate`, t, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // ---- watchlist ----
  watchlist: (t: string, activeOnly: boolean) =>
    request<{ entries: WatchlistEntry[] }>(`/admin/watchlist${activeOnly ? '?active=true' : ''}`, t),
  addWatchlist: (t: string, body: { name: string; phone?: string; plate?: string; reason: string }) =>
    request<{ entry: WatchlistEntry }>('/admin/watchlist', t, { method: 'POST', body: JSON.stringify(body) }),
  clearWatchlist: (t: string, id: string, reason: string) =>
    request<{ entry: WatchlistEntry }>(`/admin/watchlist/${id}/clear`, t, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // ---- regular passes ----
  recurringList: (t: string, p: { status?: string; q?: string }) =>
    request<{ passes: RecurringPass[] }>(`/passes/recurring${qs(p)}`, t),
  recurring: (t: string, id: string) =>
    request<{ pass: RecurringPass; passToken: string | null }>(`/passes/recurring/${id}`, t),
  issueRecurring: (t: string, body: RecurringPassInput) =>
    request<{ pass: RecurringPass; passToken: string; matches?: WatchlistMatch[] }>('/passes/recurring', t, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeRecurring: (t: string, id: string, reason: string) =>
    request<{ pass: RecurringPass }>(`/passes/recurring/${id}/revoke`, t, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  linkRecurring: (t: string, id: string) =>
    request<{ linkedAccountLabel: string | null }>(`/passes/recurring/${id}/link`, t, { method: 'POST' }),
  recurringIdPhoto: (t: string, id: string) =>
    request<{ holderName: string; imageDataUri: string | null }>(`/admin/passes/recurring/${id}/id-photo`, t),

  audit: (t: string, before?: string) => request<{ rows: AuditRow[] }>(`/admin/audit${qs({ before })}`, t),
};

/**
 * Open a report download. The server hands out a five-minute signed link; a browser opens
 * it — the phone's browser on mobile, a new tab on the web console — because a file
 * download is what browsers do well and a bearer header is what they cannot send.
 */
export async function openReport(idToken: string, kind: ReportKind, from: string, to?: string): Promise<void> {
  const result = await adminAPI.reportLink(idToken, kind, from, to);
  if (!result.success || !result.data) throw new Error(firstError(result));
  if (Platform.OS === 'web') {
    window.open(result.data.url, '_blank', 'noopener');
  } else {
    await Linking.openURL(result.data.url);
  }
}
