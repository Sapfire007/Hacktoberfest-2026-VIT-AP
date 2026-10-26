/**
 * Demo staff credentials — development fixtures only.
 *
 * The staff sign-in screen has one tab per institutional role, and each tab needs a
 * working account behind it before the features hanging off that role can be built or
 * shown. These are the accounts created by the backend's `npm run seed:demo-staff`, and
 * the two lists must stay in step — a prefilled credential that does not exist is worse
 * than no prefill, because it looks like a broken login rather than a missing seed.
 *
 * **These are not secrets, and they must never protect anything.** They are published in
 * the repository, and `EXPO_PUBLIC_*` values are embedded in the app bundle and readable
 * by anyone who installs it (VISION.md §5.3). The guard below is what keeps them out of
 * a shipped build: prefill is available only in a development build, or when the flag is
 * explicitly set. A release build compiled with `__DEV__` false and no flag has no
 * prefill at all, and the sign-in screen renders exactly as it would in production.
 */

import type { UserRoleType } from '@/context/AuthContext';

export interface DemoCredential {
  employeeId: string;
  password: string;
  role: Extract<UserRoleType, 'admin' | 'security' | 'faculty'>;
  displayName: string;
}

/** Keep in sync with `DEMO_STAFF` in Backend/Node_Backend/src/scripts/seed-demo-staff.ts. */
export const DEMO_STAFF_CREDENTIALS: Record<DemoCredential['role'], DemoCredential> = {
  admin: {
    employeeId: 'VITAP-ADM01',
    password: 'VisionAdmin@2026',
    role: 'admin',
    displayName: 'Demo Administrator',
  },
  security: {
    employeeId: 'VITAP-SEC01',
    password: 'VisionSecurity@2026',
    role: 'security',
    displayName: 'Demo Gate Officer',
  },
  faculty: {
    employeeId: 'VITAP-FAC01',
    password: 'VisionFaculty@2026',
    role: 'faculty',
    displayName: 'Demo Faculty Mentor',
  },
};

/**
 * Whether the sign-in screen may offer to fill a demo credential in.
 *
 * `__DEV__` is false in any release build, so the default answer in a shipped app is no.
 * `EXPO_PUBLIC_ENABLE_DEMO_LOGIN=1` overrides that for a demo build handed to the client,
 * and it has to be set deliberately — which is the point.
 */
export const DEMO_LOGIN_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEMO_LOGIN === '1';
