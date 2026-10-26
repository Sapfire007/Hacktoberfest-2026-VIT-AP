/**
 * Gate API — the security officer's endpoints on Node_Backend.
 *
 * Every call carries a Firebase ID token, like the rest of the app. The backend decides
 * from the token's role claim whether the caller is allowed to register an entry; nothing
 * in this file asserts a role, because a client-asserted role is not an authorization.
 */

import { API_BASE_URL } from '@/config/backend';

export interface GateCompanionInput {
  name: string;
  relation?: string | null;
  age?: number | null;
}

export interface GateVehicleInput {
  plate: string;
  /** The plate as it was before normalisation — the officer's typing, or the raw OCR. */
  plateRaw?: string;
  /**
   * How the plate reached the form. Recorded because it is the only way to find out,
   * later, whether the plate reader is earning its keep: a field that is always
   * `ocr_edited` means the model is being overruled every time.
   */
  source?: 'manual' | 'ocr' | 'ocr_edited';
  confidence?: number;
  make?: string;
  color?: string;
}

export interface WatchlistMatch {
  id: string;
  name: string;
  reason: string;
  matchedOn: ('phone' | 'plate' | 'account')[];
}

/** The officer's written reason for admitting someone who matches the watchlist. */
export interface WatchlistOverride {
  reason: string;
}

export interface GateEntryInput {
  visitorName: string;
  phone: string;
  /** Optional. A verified VISION account with this email receives the pass in its app. */
  email?: string;
  watchlistOverride?: WatchlistOverride;
  purpose: string;
  hostName?: string;
  companions?: GateCompanionInput[];
  vehicle?: GateVehicleInput | null;
  idProof: {
    idType: string;
    idLastFour?: string;
    /** Base64 data URI of the ID photo the officer took. */
    imageDataUri?: string;
    storageUri?: string;
  };
  gate?: string;
  notes?: string;
  validForHours?: number;
}

export interface GateEntry {
  id: string;
  passCode: string;
  visitorName: string;
  phone: string;
  purpose: string;
  hostName: string | null;
  companions: GateCompanionInput[];
  partySize: number;
  vehicle: {
    plate: string;
    plateRaw?: string | null;
    source: string;
    confidence?: number | null;
    make?: string | null;
    color?: string | null;
  } | null;
  idProof: {
    idType: string;
    idLastFour: string | null;
    capturedAt: string | null;
    hasPhoto?: boolean;
  };
  status: 'on_campus' | 'exited' | 'cancelled';
  entryAt: string | null;
  exitAt: string | null;
  expiresAt: string | null;
  /** Still inside after the pass expired. */
  overstay?: boolean;
  overstayMinutes?: number;
  email?: string | null;
  gate: string | null;
  registeredByEmployeeId: string;
  exitedByEmployeeId: string | null;
  notes: string | null;
  /** How they got in. Absent on older records, which are walk-ins. */
  source?: 'walkin' | 'permit' | 'recurring';
  visitRequestId?: string | null;
  recurringPassId?: string | null;
  /** The VISION account the pass was sent to, masked. */
  linkedAccountLabel?: string | null;
  /** An account matched by phone, waiting for the officer to confirm, masked. */
  suggestedAccountLabel?: string | null;
  watchlistOverride?: { reason: string; by: string } | null;
}

export type RecurringCategory = 'vendor' | 'contractor' | 'driver' | 'mess_staff' | 'other';

export const RECURRING_CATEGORY_LABELS: Record<RecurringCategory, string> = {
  vendor: 'Vendor',
  contractor: 'Contractor',
  driver: 'Driver',
  mess_staff: 'Mess staff',
  other: 'Other',
};

export interface RecurringPassInput {
  holderName: string;
  phone: string;
  email?: string;
  category: RecurringCategory;
  organisation?: string;
  purpose: string;
  hostName?: string;
  vehiclePlate?: string;
  idType: string;
  idLastFour?: string;
  idImageDataUri?: string;
  /** IST "YYYY-MM-DD", inclusive. */
  validFrom: string;
  validUntil: string;
  /** 0 = Sunday. */
  weekdays: number[];
  /** "HH:MM", 24-hour, IST. */
  dailyStart: string;
  dailyEnd: string;
  notes?: string;
  gate?: string;
  checkInNow?: boolean;
  watchlistOverride?: WatchlistOverride;
}

export interface RecurringPass {
  id: string;
  passCode: string;
  holderName: string;
  phone: string;
  email: string | null;
  category: RecurringCategory;
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

/** A regular pass as the officer sees it when it is scanned for entry. */
export interface RecurringPreview {
  passId: string;
  passCode: string;
  holderName: string;
  phone: string;
  category: RecurringCategory;
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

/** An approved visit-request permit, as the officer sees it before admitting the visitor. */
export interface PermitPreview {
  requestId: string;
  permitId: string;
  visitor: {
    name: string;
    phone: string | null;
    relation: string | null;
    sponsorName: string | null;
    photoUri: string | null;
    idTypeOnFile: string | null;
    idVerified: boolean;
  };
  idPhotoRequired: boolean;
  host: { name: string; department: string | null };
  destination: string;
  purpose: string;
  visitStartAt: string | null;
  visitEndAt: string | null;
  plate: string | null;
  watchlist?: WatchlistMatch[];
}

export interface CheckInPermitInput {
  passToken: string;
  idType: string;
  idLastFour?: string;
  idImageDataUri?: string;
  /** Omit to keep the plate from the request; `null` when they came without a vehicle. */
  vehicle?: GateVehicleInput | null;
  companions?: GateCompanionInput[];
  gate?: string;
  notes?: string;
  watchlistOverride?: WatchlistOverride;
}

/**
 * The result of scanning any pass. `action` says what the server did:
 * `exit` - recorded (or refused) a sign-out, same verdicts as `recordExit`;
 * `check_in` - an approved permit, nothing written yet, confirm with `checkInPermit`;
 * `refused` - a real permit that cannot admit anyone now (`error` says why).
 */
export interface ScanData {
  action?: 'exit' | 'check_in' | 'check_in_recurring' | 'refused';
  entry?: GateEntry;
  preview?: PermitPreview;
  recurring?: RecurringPreview;
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  status?: number;
  /** Field errors from the backend's validator, e.g. on staff account creation. */
  errors?: { msg: string }[];
}

/** The body of a 409 watchlist hit. */
export interface WatchlistHitData {
  matches?: WatchlistMatch[];
}

export async function request<T>(
  endpoint: string,
  idToken: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        ...options.headers,
      },
    });

    const body = await response.json();

    // A 4xx from the gate API carries a message written to be read at a gate, so it is
    // passed through rather than replaced with a generic one.
    if (!response.ok) {
      return {
        success: false,
        error: body.error || 'Request failed',
        message: body.message || body.error,
        // A watchlist hit (409) carries who matched; the app needs it to show the alert.
        data: body.data,
        status: response.status,
        errors: body.errors,
      };
    }

    return { ...body, status: response.status };
  } catch (error: any) {
    console.error(`Gate API error [${endpoint}]:`, error?.message);
    return {
      success: false,
      error: 'network',
      message: 'Could not reach the server. Check the connection and try again.',
    };
  }
}

export const gateAPI = {
  /** Register a walk-in visitor and receive their signed QR pass. */
  registerEntry: (idToken: string, input: GateEntryInput) =>
    request<{ entry: GateEntry; passToken: string; plateDisplay: string | null } & WatchlistHitData>(
      '/gate/entries',
      idToken,
      { method: 'POST', body: JSON.stringify(input) }
    ),

  getEntry: (idToken: string, entryId: string) =>
    request<{ entry: GateEntry }>(`/gate/entries/${entryId}`, idToken),

  /** Another copy of the QR for a pass that is still valid — a dead phone, a lost screenshot. */
  reissuePass: (idToken: string, entryId: string) =>
    request<{ entry: GateEntry; passToken: string }>(
      `/gate/entries/${entryId}/reissue`,
      idToken,
      { method: 'POST' }
    ),

  /**
   * Scan a pass and close the visit.
   *
   * A forged or expired pass comes back as `success: false` with a 200, not a thrown
   * error — the scan worked, and what it found is the answer. The caller must therefore
   * branch on `success`, not on whether this rejected.
   */
  recordExit: (idToken: string, passToken: string) =>
    request<{ entry: GateEntry }>('/gate/exit', idToken, {
      method: 'POST',
      body: JSON.stringify({ passToken }),
    }),

  /**
   * Scan any pass. The server decides whether it is an arrival or a departure, so the
   * officer never has to pick the right screen. Branch on `success` and `data.action`.
   */
  scan: (idToken: string, passToken: string) =>
    request<ScanData>('/gate/scan', idToken, {
      method: 'POST',
      body: JSON.stringify({ passToken }),
    }),

  /** Read-only permit lookup. Never records an entry or an exit. */
  previewPermit: (idToken: string, passToken: string) =>
    request<{ preview?: PermitPreview }>('/gate/permits/preview', idToken, {
      method: 'POST',
      body: JSON.stringify({ passToken }),
    }),

  /** Admit a permit holder once the officer has checked them. */
  checkInPermit: (idToken: string, input: CheckInPermitInput) =>
    request<{ entry: GateEntry; plateDisplay: string | null } & WatchlistHitData>('/gate/permits/check-in', idToken, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Admit a regular (multi-day) pass holder for today. */
  checkInRecurring: (
    idToken: string,
    input: { passToken: string; gate?: string; watchlistOverride?: WatchlistOverride }
  ) =>
    request<{ entry: GateEntry } & WatchlistHitData>('/gate/recurring/check-in', idToken, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** The officer turned someone away after a watchlist alert. */
  recordDenial: (
    idToken: string,
    input: {
      visitorName: string;
      phone?: string;
      plate?: string;
      gate?: string;
      reason?: string;
      source?: string;
    }
  ) => request<unknown>('/gate/denials', idToken, { method: 'POST', body: JSON.stringify(input) }),

  /** Send a walk-in pass to the account matched by phone, once the officer confirms it. */
  linkEntry: (idToken: string, entryId: string) =>
    request<{ linkedAccountLabel: string | null }>(`/gate/entries/${entryId}/link`, idToken, {
      method: 'POST',
    }),

  listOverstays: (idToken: string) =>
    request<{ entries: GateEntry[]; count: number }>('/gate/overstays', idToken),

  // ---- Regular (multi-day) passes ----

  issueRecurring: (idToken: string, input: RecurringPassInput) =>
    request<
      {
        pass: RecurringPass;
        passToken: string;
        entry: GateEntry | null;
        checkInNote: string | null;
      } & WatchlistHitData
    >('/passes/recurring', idToken, { method: 'POST', body: JSON.stringify(input) }),

  getRecurring: (idToken: string, id: string) =>
    request<{ pass: RecurringPass; passToken: string | null }>(`/passes/recurring/${id}`, idToken),

  linkRecurring: (idToken: string, id: string) =>
    request<{ linkedAccountLabel: string | null }>(`/passes/recurring/${id}/link`, idToken, {
      method: 'POST',
    }),

  listOnCampus: (idToken: string, limit = 100) =>
    request<{ entries: GateEntry[]; count: number; peopleOnCampus: number; overstayCount?: number }>(
      `/gate/on-campus?limit=${limit}`,
      idToken
    ),

  listMyEntries: (idToken: string, limit = 50) =>
    request<{ entries: GateEntry[] }>(`/gate/my-entries?limit=${limit}`, idToken),

  /** Fallback lookup by pass code, plate or phone, for when the QR will not scan. */
  search: (idToken: string, query: string) =>
    request<{ entries: GateEntry[] }>(`/gate/search?q=${encodeURIComponent(query)}`, idToken),
};
