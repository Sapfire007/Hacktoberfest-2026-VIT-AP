/**
 * Gate pass tokens — signing and verification
 *
 * A gate pass is what the QR code actually contains. It is a compact, signed string
 * rather than a bare record id, for one reason: **the gate has to work offline**
 * (VISION.md section 1). A QR holding only an id forces a database lookup on every exit
 * scan, which is exactly what is unavailable when the campus link is down. A signed
 * token carries its own claims, so an officer's device can verify authenticity and
 * expiry with nothing but the shared key.
 *
 * Format — three dot-separated parts, all base64url:
 *
 *     VP1.<payload>.<signature>
 *
 * `VP1` is a version tag. It exists so the signing scheme can change later without every
 * previously issued pass becoming unparseable — a verifier that meets `VP2` can say
 * "this pass needs a newer app" instead of "invalid pass".
 *
 * The signature is HMAC-SHA256 over the literal `VP1.<payload>` bytes. HMAC rather than a
 * public-key signature because both the issuer and the verifier are ours: there is no
 * third party who needs to verify without being able to issue, which is the only thing
 * asymmetric signing would buy, and it would cost key distribution to every gate device.
 */

import crypto from 'crypto';

/** Version tag. Bump only when the payload shape or algorithm changes. */
const PASS_VERSION = 'VP1';

/**
 * The claims inside a pass. Kept to single-letter keys because every byte lands in the QR
 * code, and QR density is what decides whether a phone camera can read it in bad light
 * from a metre away.
 */
interface PassClaims {
  /** entry id */
  i: string;
  /** pass code, the human-readable form printed under the QR */
  c: string;
  /** visitor name, truncated — lets the exit screen show who this is with no network */
  n: string;
  /** party size */
  p: number;
  /** vehicle plate, or empty */
  v: string;
  /** issued at, seconds since epoch */
  ia: number;
  /** expires at, seconds since epoch */
  ea: number;
  /**
   * kind — `p` for a visit-request permit, `r` for a recurring (multi-day) pass, absent
   * for a walk-in pass. Optional so that every walk-in pass issued before the other kinds
   * existed still verifies unchanged; that is why this did not need a version bump. The
   * kind is inside the signature, so one kind of pass cannot be relabelled as another.
   */
  k?: 'p' | 'r';
}

export type PassKind = 'walkin' | 'permit' | 'recurring';

export interface VerifiedPass {
  entryId: string;
  passCode: string;
  visitorName: string;
  partySize: number;
  plate: string | null;
  issuedAt: Date;
  expiresAt: Date;
  kind: PassKind;
}

export type PassVerification =
  | { ok: true; pass: VerifiedPass }
  | { ok: false; reason: 'malformed' | 'unsupported_version' | 'bad_signature' | 'expired' };

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * The HMAC key.
 *
 * Read on every call rather than captured at module load, so a test can set the variable
 * and a misconfigured deployment fails at the first issue attempt with a clear message
 * instead of silently signing with a default. There is deliberately no fallback value —
 * a hardcoded default key is the same as no signature at all.
 */
function getSigningKey(): Buffer {
  const secret = process.env.GATE_PASS_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'GATE_PASS_SECRET is missing or too short (need at least 32 characters). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return Buffer.from(secret, 'utf8');
}

function sign(signingInput: string): string {
  return base64url(crypto.createHmac('sha256', getSigningKey()).update(signingInput).digest());
}

/**
 * Issue a pass token.
 *
 * `visitorName` is truncated to 32 characters: the exit screen only needs enough to
 * confirm the person matches, and a long name is pure QR density for no benefit.
 */
export function issuePass(params: {
  entryId: string;
  passCode: string;
  visitorName: string;
  partySize: number;
  plate?: string | null;
  issuedAt?: Date;
  expiresAt: Date;
  kind?: PassKind;
}): string {
  const issuedAt = params.issuedAt ?? new Date();

  const claims: PassClaims = {
    i: params.entryId,
    c: params.passCode,
    n: params.visitorName.slice(0, 32),
    p: params.partySize,
    v: params.plate ?? '',
    ia: Math.floor(issuedAt.getTime() / 1000),
    ea: Math.floor(params.expiresAt.getTime() / 1000),
    ...(params.kind === 'permit' ? { k: 'p' as const } : {}),
    ...(params.kind === 'recurring' ? { k: 'r' as const } : {}),
  };

  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${PASS_VERSION}.${payload}`;

  return `${signingInput}.${sign(signingInput)}`;
}

/**
 * Verify a scanned pass.
 *
 * Returns a reason rather than throwing, because each failure means something different
 * to the officer holding the scanner: a malformed string is usually the wrong QR code
 * entirely, a bad signature is a forged or tampered pass and should be escalated, and an
 * expired one is a real pass that simply overstayed — which is a conversation, not an
 * incident.
 */
export function verifyPass(
  token: string,
  now: Date = new Date(),
  options: { ignoreExpiry?: boolean } = {}
): PassVerification {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [version, payload, signature] = parts;
  if (version !== PASS_VERSION) return { ok: false, reason: 'unsupported_version' };

  const expected = sign(`${version}.${payload}`);

  // Constant-time comparison. A plain `!==` leaks, through timing, how many leading bytes
  // of a guessed signature were correct, which is enough to forge one byte at a time.
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  if (
    expectedBytes.length !== actualBytes.length ||
    !crypto.timingSafeEqual(expectedBytes, actualBytes)
  ) {
    return { ok: false, reason: 'bad_signature' };
  }

  let claims: PassClaims;
  try {
    claims = JSON.parse(fromBase64url(payload).toString('utf8'));
  } catch {
    // The signature checked out, so this is a version skew rather than an attack.
    return { ok: false, reason: 'malformed' };
  }

  const expiresAt = new Date(claims.ea * 1000);
  // `ignoreExpiry` is for signing a permit holder *out*: their permit ends with the visit
  // window, and a meeting that runs ten minutes over must not strand them at the barrier.
  // An overstay shows up instead as a gate entry still on campus past its own expiry.
  if (!options.ignoreExpiry && expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    pass: {
      entryId: claims.i,
      passCode: claims.c,
      visitorName: claims.n,
      partySize: claims.p,
      plate: claims.v || null,
      issuedAt: new Date(claims.ia * 1000),
      expiresAt,
      kind: claims.k === 'p' ? 'permit' : claims.k === 'r' ? 'recurring' : 'walkin',
    },
  };
}

/**
 * A short, human-readable pass code.
 *
 * Crockford-style alphabet with I, L, O and U removed: those are the characters people
 * misread or mistype when reading a code aloud over a radio, which is exactly how a gate
 * code gets used when a phone screen has died.
 */
export function generatePassCode(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `VIS-${code}`;
}
