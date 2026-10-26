# VISION — Progress Tracker

> A dated log of what changed and a checklist of what is outstanding.
> For what the project *is*, its roles, decisions and architecture, see `VISION.md`.
> This file is a log, not a specification — nothing here is authoritative once it
> contradicts `VISION.md`, `PRD.md` or `Design.md`.

**Last updated:** 2026-10-05

---

## Status Legend

- Complete
- In Progress
- Not Started

---

## Overall Module Status

| Module | Location | Status | Key Features |
|---|---|---|---|
| **PRD & Design Specs** | Root (`PRD.md`, `Design.md`) | ✅ Completed Baseline | PRD v1.0, Design v1.0, ER schema, UX specs |
| **Biometric Backend** | `Backend/Biometric_Backend/` | ✅ Active (Running :8001) | DeepFace (VGG-Face, Python 3.11 `venv_deepface`), Local weights (`.deepface/weights/`), Multi-angle enrollment, Fernet encryption, 1:1 verify, 1:N gate identify |
| **Main Node/Express Backend**| `Backend/Node_Backend/` | ✅ Active (Running :3000) | Auth, RBAC, staff provisioning, gate entries, signed QR passes |
| **ANPR Backend** | `Backend/ANPR_Backend/` | ✅ Active (Running :8002) | YOLOv9-t plate detector + plate-specific OCR (fast-alpr, ONNX/CUDA), Indian-format post-processing, temporal voting, fine-tuning scripts |
| **React Native Mobile App** | `ReactNative_App/VISION/` | ✅ Active (Running :8081) | Onboarding, Neumorphic UI, Biometric capture, Role switching |

---

## Detailed Task Checklist

### 1. Biometric Backend (`Backend/Biometric_Backend/`)
- [x] Service Architecture & Configuration (`app/config.py`, `.env`, `requirements.txt`)
- [x] Python 3.11 ML Environment (`venv_deepface` with DeepFace 0.0.100, TensorFlow 2.21, tf-keras 2.21, OpenCV 5.0)
- [x] Project-contained model weights (`.deepface/weights/vgg_face_weights.h5`)
- [x] Encryption Module (`app/core/encryption.py` — Fernet AES-128-CBC)
- [x] Image & Face Validation Engine (`app/core/validators.py`)
- [x] DeepFace Engine (`app/core/face_engine.py` — VGG-Face, OpenCV detector, composite multi-angle averaging, cosine distance)
- [x] Health Check Endpoint (`GET /api/v1/health` — Verified 200 OK)
- [x] Biometric Enrollment Endpoints (`POST /api/v1/biometric/enroll`, `POST /api/v1/biometric/re-enroll`, `GET /status`, `DELETE /{user_id}`)
- [x] Verification & Gate Identification Endpoints (`POST /api/v1/biometric/verify`, `POST /api/v1/biometric/identify`)
- [x] FastAPI Server (`app/main.py` running on `http://0.0.0.0:8001`)

### 2. React Native App (`ReactNative_App/VISION/`)
- [x] Installed all npm packages (`expo 57.0.11`, `react-native 0.86.2`, `expo-camera`, etc.)
- [x] Design token compatibility (`Colors.primary`, `Colors.yellow500`, `Colors.green500`, `Typography.h1-h3`, `Typography.body`, `Spacing['2xs']`)
- [x] Integrated `BiometricCapture.tsx` automatic capture component
- [x] Metro bundler & Expo dev server running on `http://localhost:8081`

---

---

## Progress Log

### 2026-10-05 — Security hardening

**Staff account takeover closed.** Provisioning a staff account, and a faculty member's first
sign-in, reused any existing Firebase user with the same email. Self-signup accepts any
address unverified, so someone could register a staff member's address, or
`vitap-adm02@staff.local`, and receive that role on their own account. Staff and faculty now
get server-minted uids (`staff_<ID>`, `faculty_<username>`) with no email.
`npm run audit:accounts` lists any account adopted before the fix.

**Staff accounts:**
- Deactivation also disables the Firebase user.
- The demo accounts are refused when `NODE_ENV=production`.
- `/register` refuses staff.
- Passwords are capped at 128 characters and may not be the employee ID.
- The app has a Change password screen, and RoleGuard sends staff there while
  `mustChangePassword` is set. Until now nothing enforced it.
- `npm run reset:faculty-password` rotates a directory faculty member's password, including
  the one leaked in git history.

**Face service requires sign-in.** The app sends its Firebase token; the service asks Node
(`GET /api/auth/session`) whose it is.
- Users manage only their own face.
- Identification is limited to security and admin.
- `user_id` must be a plain id; `C:x` used to escape the store directory on Windows.
- `threshold_override` can only tighten matching.
- The temporary encryption key is no longer printed.

**Input and leaks:**
- ID uploads and gate ID photos are checked against their bytes (JPEG, PNG, WebP, HEIC or
  PDF; never SVG or HTML), with size caps.
- Free-text gate fields are truncated to sane lengths.
- The `/profile` response no longer carries the ID document, which the app was caching in
  plain storage.
- Bodies are limited to 1 MB except on the four photo routes, and parser errors answer
  400/413.
- Internal error messages appear only in development.
- Logs drop query strings, and password-reset links are no longer logged.
- The unused `/auth/check-email` is removed.
- `Cache-Control: no-store` on the API.
- CORS: credentials off; outside development only `CORS_ORIGINS`; the Python services
  default to no browser origins.
- `storage.rules` (deny all) has been added, along with a root `.gitignore` safety net for
  env and key files.

Verified:
- Node typecheck is clean.
- The app typecheck is at the 82-error baseline, with none in changed files.
- 50/50 scratch checks against the real Express app with in-memory Firestore and Auth.
- 15/15 checks against the face service under uvicorn with a stubbed Node.

Nothing has been run on a device yet.

### 2026-09-29 — Admin console, overstays, regular passes, passes in the visitor's app, watchlist

**Admin console.** The `(admin)` placeholder is now the console: live overview, the
entry/exit log, gate records, analytics, reports, regular passes, watchlist, staff and
visitor accounts, and the audit log. The same screens run on a phone (the overview doubles as
the menu), a tablet, and in a browser: `services/firebase.auth.web.ts` gives the web build a
working sign-in. It needs the Firebase web config in `.env`.

**Gate log and audit log.** Every entry, exit and denial writes a `gate_events` row in the
same batch as the change, so the log cannot disagree with the records. Consequential staff
actions write `audit_log` rows: account changes, watchlist edits, overrides, passes, ID-photo
views and report downloads.

**Overstays** are entries still on campus after their pass expired. Security sees a red
banner and a filter, and admin sees them on the overview. The security home now refreshes
every minute.

**Regular passes** for vendors, contractors, drivers and mess staff. Each has a date range,
weekdays and daily hours, and one QR reused daily. Security can issue one for up to 30 days
at the gate, which also checks the holder in; admin can issue up to 180 days.

**Passes reach the visitor's account.** A pass is linked automatically by *verified* email.
A phone-number match is only suggested, and the officer confirms it, because profile phone
numbers are unverified.

**Watchlist:** alert, officer decides. Deny, or admit with a written reason. Both are logged
and the admin is alerted.

**Reports:** daily register as CSV or PDF (pdfkit), and the gate log as CSV, served through
five-minute signed links. CSV cells are protected against formula injection.

**Access revocation is now immediate.** ID tokens are verified with `checkRevoked`, so
deactivating staff or suspending a visitor takes effect on their next request, not up to an
hour later.

Verified: backend typecheck; 75/75 scratch checks against an in-memory Firestore; the web
bundle exports and the sign-in screen renders in a browser. The admin screens have not been
seen with live data, and nothing has been run end to end on a device.

### 2026-09-28 — Visit requests on the server, rate limiting, permits scanned at the gate

**Visit requests moved behind the backend.** The request flow read and wrote Firestore
directly from the app, unauthenticated, which only works with open security rules — so the
faculty collection's password hashes, every user profile and every request were readable and
writable by anyone holding the app's public Firebase config. `/api/visits` and `/api/faculty`
now own that data: identity comes from the token, only the host faculty member can
approve or reject, only the requester can cancel, and status changes run in transactions.
`Node_Backend/firestore.rules` denies all client access and still has to be published.

**Rate limiting** (`middleware/rateLimit.middleware.ts`): failed logins per IP, authenticated
traffic per user rather than per IP, because the campus shares a NAT address.

**Permits are real and usable at the gate.** Approval issues a signed pass with a `permit`
kind inside the signature. Security has one scanner for every pass: a walk-in pass or a
checked-in permit signs out; an unused permit opens a check-in screen showing the visitor's
photo, host and window, where the officer records the ID checked, vehicle and companions.
A permit admits once, from 30 minutes before its window to its end. A checked-in permit can
always sign out, even after its window, so an overrunning meeting does not strand anyone.

**Students sponsor a parent** instead of getting a permit in their own name (§3.4). The
request carries the parent's name, phone and relation, and the parent's ID is photographed
at the gate since they have no account.

Not done: mentor routing for student requests (no student→mentor data exists), sharing the
permit image from the app (no sharing module in the build; a screenshot works), vehicles and
notifications are still local, and none of this has been run end to end on a device.

### 2026-09-16 — Gate module: staff role tabs, walk-in registration, QR passes, ANPR

**Staff sign-in now has three tabs** — Admin, Security, Faculty — matching the visitor
sign-in's shape. Each tab states what that role's app actually does, which is also the
honest place to note what is still a placeholder.

The tab is a **hint, not an authorization**. Nothing about it is sent to the backend, and
routing follows the server-issued role claim exactly as before; a mismatch between tab and
real role is shown as a note and the user still lands where their claim says. Letting the
tab influence the destination would have reintroduced the client-side role selection the
September auth rebuild removed.

Three demo staff accounts back the tabs, created by `npm run seed:demo-staff`
(`VITAP-ADM01` / `VITAP-SEC01` / `VITAP-FAC01`). They are published fixtures, prefilled only
under `__DEV__` or an explicit flag, and the seed script refuses to run in production.

**Walk-in visitor registration.** A security officer can register someone who arrives
without an account: name, phone, purpose, host, companions as a repeating sub-form, vehicle,
and a photographed government ID. The ID photo is required — without it the record is a
handwritten register with extra steps. Only the last four characters of an ID number are
stored; the officer has already inspected the document in person, so keeping the full number
adds exposure without adding verification.

**Signed QR gate passes** (ADR-007). The QR carries `VP1.<claims>.<HMAC-SHA256>`, not a
record id, so an exit scan can verify authenticity and expiry without a database lookup —
which is what makes offline verification a key-distribution problem rather than a redesign.
Signature tampering, payload tampering, expiry and malformed input were each verified to be
rejected with a distinct reason, because at a gate "expired" and "forged" call for very
different responses.

**Exit scanning and the on-campus roll.** A scan resolves to one of three unmistakable
outcomes — signed out, already-out/expired, or refused — and there is a fallback lookup by
pass code, plate or phone for when a screen is cracked or a phone is dead. A gate with no
fallback is a gate people route around.

**ANPR** (ADR-006). New `Backend/ANPR_Backend` on port 8002, in its own virtual environment:
a YOLOv9-t ONNX plate detector feeding a plate-specific OCR recogniser, via `fast-alpr`.
Separate from the biometric service because TensorFlow and `onnxruntime-gpu` pin conflicting
CUDA versions and the resulting failure is a silent CPU fallback, not a crash.

Post-processing is where most of the real accuracy comes from: positional confusion
correction (the first two characters are always letters, the last four always digits, so an
`O` in a digit slot is unambiguously a `0`), state-code repair, Indian format validation
including the Bharat series, and temporal voting across a burst of frames. The app captures
five frames and majority-votes them, because per-frame errors come from per-frame conditions
that do not repeat.

**The plate field is always editable.** The camera fills it in and never owns it; any
keystroke marks the record `ocr_edited` and keeps the original read alongside it, so it stays
answerable later whether the model is helping or being overruled every time.

Also shipped: `scripts/check_gpu.py` (which exists specifically to break onnxruntime's
silent CPU fallback), `scripts/benchmark.py` (throughput, exact-match rate, character error
rate, and a confusion table), `scripts/prepare_dataset.py` and the two fine-tuning scripts.

**Not done, and not claimed:** ANPR accuracy on real VIT-AP gate traffic is unmeasured. The
device-side offline cache does not exist. Face matching is not wired into the gate flow —
a walk-in is vouched for by an inspected ID, not a face.

---

### 2026-09-10 — First successful Android dev build

Got the app running on a local Android emulator for the first time since ADR-005 made a
dev build mandatory. Three unrelated build-system issues, found by actually running the
build rather than reasoning about it:

- `android/gradle/gradle-daemon-jvm.properties` was pinning the Gradle daemon to **JDK
  25** (from a stray `gradlew updateDaemonJvm` run at some point). JDK 25's native-access
  restrictions broke the CMake configure step for `react-native-worklets`. Deleted; Gradle
  now falls back to `JAVA_HOME` (JDK 17, which this toolchain is built against).
- `expo-face-detector` (^13.0.2) — already flagged as dead code in the original repo audit
  (never imported anywhere in `src/`) — failed to compile: its Kotlin source targets an
  Expo SDK generation whose `expo-modules-core` APIs no longer exist in SDK 57. Uninstalled.
- `android/local.properties` (gitignored, regenerated by every `expo prebuild`) needs
  `sdk.dir` set explicitly on this machine, since `ANDROID_HOME` isn't exported in the
  shell. A backslash-escaped Windows path in that file fails with "filename, directory
  name, or volume label syntax is incorrect" — forward slashes work.

Also: added `src/config/backend.ts`, a shared resolver for the API/biometric base URLs —
env vars still win when set, otherwise it defaults to `10.0.2.2` (the Android emulator's
host alias) rather than the old hardcoded `localhost` fallbacks scattered across
`api.service.ts` and `biometric.api.ts`. `.env.example` documents the `adb reverse`
alternative for a USB-connected physical device.

Result: `com.vision.app` builds and installs cleanly via `npx expo run:android`. Full
startup instructions, including the two one-time steps above, are now in `VISION.md` §5.2.

### 2026-09-10 — Role & authentication model rewritten; documentation consolidated

**Decisions taken**
- Stay on React Native + Expo. Flutter was evaluated and rejected — recorded as `VISION.md` ADR-001.
- Authentication splits into two tracks: email + password for Visitor / Parent / Student, employee ID + password for Faculty / Security / Admin.
- "Student" now means an enrolled VIT-AP student. Students visiting from other institutions became the Visitor subtype `external_student`.
- Google Sign-In demoted to an optional secondary button for the email track.

**Documentation**
- Created `VISION.md` as the single source of truth — project identity, canonical role/auth model, repository map, as-built architecture, decision log (ADR-001..005), delivery phases, and an honest built-vs-specified status table.
- Rewrote `PRD.md` §0, §4.1, §4.3, §4.4, §5, §6, §7.1, §7.2, §7.11, §8, §9, §14, §15 for the new model. Added FR-REG-01a/01b/01c, FR-REG-10, FR-PROF-05..09, FR-ADM-06..09, NFR-SEC-04..06.
- Rewrote `Design.md` §2, §3, §4.1, §5.1, §5.4, §5.5, §5.6, §5.7, §6, §7.2, §8, §9.1, §11, §12. `Design.md` had never received the revision `PRD.md` got earlier and was carrying two stale generations (Phone/OTP *and* the old sponsor framing) — both are now gone. Added §5.5a Staff Sign-In and §9.1a Credential security.
- Consolidated 8 redundant markdown files into the three surviving documents. Merged the two divergent progress trackers into this one.

**Backend — authentication rebuilt**
- Deleted the unsigned-JWT fallback in `src/config/firebase.admin.ts`. Verified: a forged `alg:none` token now returns 401 where it previously authenticated as the uid in its `sub` claim.
- `/api/auth/register` clamps the role server-side to `visitor|parent|student`; the role is written to a Firebase custom claim and read back from the verified token.
- New `src/middleware/rbac.middleware.ts` — `requireRole`, `requireSelfOrRole`, `requireVerifiedEmail`. Biometric reads are now owner/security/admin only.
- New `src/services/staff.service.ts` — bcrypt employee-ID credentials in `staff_credentials/{employeeId}`, lockout after 5 failures, constant-time-ish failure for unknown IDs, refuses to deactivate the last active admin.
- New endpoints: `POST /api/auth/staff/login`, `/auth/staff/password`, `/auth/password/reset`, `GET /auth/staff/me`, and `/api/admin/staff` (list, provision, reset password, activate/deactivate).
- New `npm run seed:admin` bootstrap script; refuses to run once an active admin exists.
- Deleted `src/routes/dummy.routes.ts`, which depended on the unsigned-token fallback.
- Fixed: `createOrUpdateUser` never wrote `createdAt` (silently breaking `getAllUsers`, which orders by it) and reset `biometricEnrolled` on every sign-in.
- Fixed: a missing `serviceAccountKey.json` was fatal even when `FIREBASE_PRIVATE_KEY` was set; it now falls back with a warning.
- Invalid tokens return 401 rather than 403, so the app can tell "sign in again" from "not allowed".

**App — auth rebuilt**
- New `src/services/firebase.auth.ts`, the one module that touches Firebase, on the v26 modular API.
- Rewrote `AuthContext`: `signUpWithEmail`, `signInWithEmail`, `signInWithGoogle`, `signInAsStaff`, `changeStaffPassword`, password reset, email verification. Role comes from the backend; `switchRole()` and `signInDummy()` are gone.
- New screens: `sign-up`, `sign-in`, `verify-email`, `staff-login`. Deleted `phone-otp.tsx`, the orphaned `src/screens/Login.tsx`, and `src/api/FirebaseAuthUtils.ts`.
- New `RoleGuard`; `(main)`, `(faculty)`, `(student)` are guarded, and `(security)` and `(admin)` groups added so those roles have somewhere valid to land.
- Tokens moved to `expo-secure-store`; sign-out now ends the Firebase and Google sessions.
- Added `eas.json` with a `development` profile.
- Type check: 76 errors, down from a pre-existing baseline of 83. Every file touched or added by this work is clean; the remainder are pre-existing `user is possibly null` cases plus the unrouted `explore.tsx` template leftover.

**Still to do**
- Seed an admin (`npm run seed:admin`) and run the staff sign-in end to end.
- Build and install the development build, then walk the email sign-up, verification and sign-in flows on a device.
- Console configuration for the optional Google button: Android SHA-1, a real `google-services.json`, Android/iOS OAuth client IDs.
- Authenticate the biometric service — every endpoint there is still open, including `DELETE /api/v1/biometric/{user_id}`.

---

### 2026-08-10 — Biometric Backend Server & API Verification

**Key Milestones:**
- ✅ Installed all dependencies in `Backend\Biometric_Backend\venv`
- ✅ Started FastAPI server on port 8000
- ✅ Verified Health Check endpoint (`GET /api/v1/health`) → Healthy
- ✅ Tested Multi-Pose Enrollment (`POST /api/v1/biometric/enroll`) → 201 Created (128-dim composite vector generated & encrypted)
- ✅ Tested 1:1 Verification (`POST /api/v1/biometric/verify`) → Verified match (Confidence 1.0)
- ✅ Tested 1:N Gate Identification (`POST /api/v1/biometric/identify`) → Successfully identified `usr_alex` out of enrolled candidate profiles

**Changes:**
- ✅ Moved `Node_Backend/` from project root to `Backend/Node_Backend/`
- ✅ Updated `ARCHITECTURE_SUMMARY.md` with new folder structure
- ✅ Updated backend README and TypeScript conversion docs with correct paths

**New Backend Path:** `Backend/Node_Backend/`

**Commands updated:**
- Install dependencies: `cd Backend/Node_Backend && npm install`
- Start dev server: `cd Backend/Node_Backend && npm run dev`
- Service account key location: `Backend/Node_Backend/serviceAccountKey.json`

---

### 2026-08-09 — Gmail Authentication & Backend Integration (TypeScript)

**Major Changes:**

1. **Student Role Update**
   - ✅ Changed "Student (Sponsor)" to "External Student" 
   - ✅ Updated role-select.tsx with new description: "Visiting for project, internship, or research collaboration"
   - ✅ Updated PRD.md sections 5, 6, and 7.1 to reflect External Student as visitors from other institutions

2. **Authentication System Overhaul**
   - ✅ Replaced phone/OTP authentication with Gmail/Google Sign-In
   - ✅ Updated PRD.md FR-REG-01 to specify Google Sign-In as authentication method
   - ✅ Created Firebase client configuration (`src/config/firebase.config.ts`)
   - ✅ Updated AuthContext with Firebase auth integration and dummy mode for testing
   - ✅ Converted phone-otp.tsx to Gmail auth screen with Google Sign-In button
   - ✅ Added AsyncStorage persistence for auth tokens and user data
   - ✅ Implemented backend API communication methods in AuthContext

3. **Backend Setup (Node.js + TypeScript + Express + Firebase Admin)**
   - ✅ Converted entire backend from JavaScript to TypeScript
   - ✅ Created complete backend folder structure in `Backend/Node_Backend/`
   - ✅ TypeScript configuration with strict type checking (`tsconfig.json`)
   - ✅ Type definitions for all models and interfaces (`src/types/index.ts`)
   - ✅ Firebase Admin SDK configuration (`src/config/firebase.admin.ts`)
   - ✅ User service with Firestore operations (`src/services/user.service.ts`)
   - ✅ Authentication middleware for token verification (`src/middleware/auth.middleware.ts`)
   - ✅ Auth routes: /api/auth/register, /api/auth/login, /api/auth/me (`src/routes/auth.routes.ts`)
   - ✅ Main Express server with CORS, Helmet, Morgan logging (`src/server.ts`)
   - ✅ Environment configuration with .env and .env.example
   - ✅ Comprehensive README.md with TypeScript setup instructions
   - ✅ Security: .gitignore for sensitive files (service account keys, .env, compiled JS)

4. **Environment & Security**
   - ✅ Frontend .env for Firebase client credentials
   - ✅ Backend .env for Firebase Admin SDK and API secrets
   - ✅ Updated .gitignore in both frontend and backend to exclude all .env files
   - ✅ Created .env.example templates for both frontend and backend
   - ✅ API_BASE_URL configuration for frontend-backend communication

**Files Modified:**

**Frontend (ReactNative_App/VISION):**
- `PRD.md` — Updated student role and authentication method
- `src/app/(onboarding)/role-select.tsx` — Changed student role description
- `src/app/(onboarding)/phone-otp.tsx` — Converted to Gmail auth screen
- `src/context/AuthContext.tsx` — Rewritten with HTTP API calls to Backend (NO Firebase SDK)
- `src/services/api.service.ts` — HTTP API service for all Backend communication
- `.env` — Environment variables for Backend API URL and Google Sign-In (NO Firebase)
- `.env.example` — Template for environment setup
- `.gitignore` — Added .env exclusions
- `FRONTEND_ARCHITECTURE.md` — Frontend architecture documentation

**Backend (Backend/Node_Backend):**
- `src/server.ts` — Main Express server (TypeScript)
- `src/config/firebase.admin.ts` — Firebase Admin SDK setup (TypeScript)
- `src/services/user.service.ts` — User CRUD operations with Firestore (TypeScript)
- `src/middleware/auth.middleware.ts` — JWT token verification (TypeScript)
- `src/routes/auth.routes.ts` — Authentication endpoints (TypeScript)
- `src/types/index.ts` — TypeScript type definitions and interfaces
- `tsconfig.json` — TypeScript configuration
- `package.json` — Dependencies and TypeScript build scripts
- `.env` — Backend environment variables
- `.env.example` — Backend environment template
- `.gitignore` — Security exclusions (includes dist/ folder)
- `README.md` — Comprehensive setup guide with TypeScript instructions

**Architecture:**
- **Frontend**: UI-only + HTTP API calls (React Native + Expo + TypeScript)
  - Uses @react-native-google-signin/google-signin (NOT Firebase SDK)
  - Gets Google ID token and sends to Backend
  - NO direct Firebase/Firestore operations
  - All data operations through Backend API
- **Backend**: All business logic + Firebase Admin SDK (Node.js + Express + TypeScript)
  - Full type safety with TypeScript
  - Verifies ID tokens with Firebase
  - All Firestore database operations
  - Returns JSON responses to Frontend
- **Authentication**: Google Sign-In → Get ID Token → Send to Backend → Backend verifies with Firebase Admin → Firestore
- **Data Flow**: Frontend UI → HTTP API → Backend (TypeScript) → Firebase/Firestore → JSON Response → Frontend Display

**Next Steps:**
- [ ] Install backend dependencies when network is stable: `cd Backend/Node_Backend && npm install`
- [ ] Set up Firebase project in console
- [ ] Download Firebase service account key
- [ ] Configure environment variables in both .env files
- [ ] Test backend server: `npm run dev`
- [ ] Integrate actual Google Sign-In in frontend
- [ ] Test full auth flow: Sign-In → Token → Backend → Firestore
- [ ] Add visit request creation endpoints
- [ ] Add vehicle management endpoints
- [ ] Implement faculty approval workflow endpoints

---

### 2026-08-08 — Project Kickoff & Completion
- ✅ Phase 1 to Phase 7 Completed!
- ✅ Replaced hardcoded text with official `VIT-AP_University_logo.png` logo image on Splash/Landing page and NeuHeader.
  - Installed native dependencies (`expo-linear-gradient`, `expo-haptics`, `expo-camera`, `@react-native-async-storage/async-storage`, `react-native-svg`)
  - Defined color tokens (`src/constants/colors.ts`) matching PRD.md §3 and Stitch palette (Navy `#0B2545`, Accent Orange `#E8720C`, Green `#1E8E3E`, Red `#D93025`, Blue `#2F6FED`, Purple `#7B4FE0`)
  - Configured typography scale (`src/constants/typography.ts`) with Inter font variants
  - Created neumorphic style utilities (`src/constants/neumorphic.ts`) supporting outset, inset, and dark surface shadows with 8px spacing grid
  - Integrated global CSS and theme exports (`src/constants/theme.ts`)

- ✅ **Phase 2: Reusable UI Components**
  - `NeuCard`: Neumorphic outset surface card
  - `NeuButton`: Button with pressed/released shadow transitions and variant support
  - `NeuInput`: Inset neumorphic input field with label and error state
  - `StatusChip`: Pill badge for visit lifecycle status (Submitted, Under Review, Approved, Rejected, Expired)
  - `CategoryBadge`: Visitor subtype badge (Parent, Vendor, Guest Lecturer, Alumni, Student)
  - `PermitCard`: Active QR permit card with countdown timer, offline badge, and requester metadata
  - `ProfileAvatar`: Avatar with verified checkmark overlay
  - `EmptyState`: Icon + title + message + action CTA pattern
  - `AlertBanner`: Sticky top system status / offline warning banner
  - `NeuTabBar`: Floating bottom tab bar navigation
  - `TimelineStep`: Vertical status lifecycle timeline step
  - `RequestCard`: Visit request card item
  - `SearchBar`: Inset search input with clear button
  - `FilterChips`: Horizontal scrollable filter chips
  - `NeuHeader`: Header bar with VISION logo, VIT-AP emblem, and notification action
  - `VehicleCard`: Saved vehicle card with plate number and default toggle
  - `NotificationItem`: Notification feed item component
  - `BiometricCaptureFrame`: Centered oval face frame guide with state ring animations
  - `StepIndicator`: 4-step segmented pose progress indicator (Front, Left, Right, Tilt)

- ✅ **Phase 3: Mock Data & State Management**
  - Created `src/data/mockData.ts` matching PRD.md schema and Stitch screens
  - Built `AuthProvider` (`src/context/AuthContext.tsx`) for active role switching (Visitor, Parent, Faculty, Student)
  - Built `AppProvider` (`src/context/AppContext.tsx`) for managing requests, active permits, vehicles, and notifications

- ✅ **Phase 4: Onboarding Flow Screens**
  - `Splash`: Recreated Stitch Onboarding Welcome screen with dark navy background, VIT-AP emblem, and dark neumorphic eye logo
  - `RoleSelect`: Selection screen for Visitor (with subtype chips), Parent, Student, and Faculty
  - `PhoneOtp`: Phone number entry and 6-digit OTP verification
  - `BiometricCapture`: Hands-free guided 4-pose auto-capture (Front -> Left -> Right -> Tilt) with oval frame
  - `GovtIdUpload`: Government ID document upload (Aadhaar, Voter ID, Driving Licence, Passport, College ID)
  - `ProfileForm`: Structured profile onboarding form
  - `Consent`: Explicit biometric processing opt-in consent
  - `Done`: Registration complete confirmation

- ✅ **Phase 5: Visitor/Parent Main App Screens**
  - `MainLayout`: Stack & floating neumorphic tab bar navigator
  - `Home`: Recreated Stitch Visitor Home screen with Active Permit card and Recent Requests
  - `Requests`: Searchable requests list with filter chips
  - `NewRequest`: Request creation form with faculty directory lookup and vehicle attachment
  - `RequestDetail`: Detailed view with vertical status lifecycle timeline
  - `PermitDetail`: Full screen active QR permit detail with cryptographic signature note
  - `History`: Completed visit history with entry/exit timestamps and duration calculation
  - `MyVehicles` & `AddVehicle`: Saved vehicle management and vehicle registration
  - `Notifications`: Notifications feed with read status tracking
  - `Profile`: Profile & settings with demo role switcher
  - `LinkedStudents`: Parent role linked student wards management

- ✅ **Phase 6: Faculty/Mentor App Screens**
  - `FacultyLayout`: Faculty bottom tab navigation
  - `Inbox`: Recreated Stitch Faculty Request Inbox screen with pending count badge, search, and category cards
  - `RequestDetail`: Faculty review screen with requester context, verified badge, Approve / Reject (with mandatory remarks) actions
  - `History`: Decision history log
  - `Advisees`: Student advisee list under mentor guidance
  - `Profile`: Faculty profile details

- ✅ **Phase 7: Student (Sponsor) App Screens** *(Now External Student)*
  - `StudentLayout`: Student app navigation
  - `Home`: Student homepage with project/internship visit management
  - `Sponsor`: Visit request form for external students
  - `SponsoredVisits`: Tracker for external student visit requests
  - `Profile`: Student profile screen

---

---

## Phase Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation & Design System | ✅ Complete |
| 2 | Reusable UI Components | ✅ Complete |
| 3 | Mock Data & State Management | ✅ Complete |
| 4 | Onboarding Flow Screens | ✅ Complete |
| 5 | Visitor/Parent Main App | ✅ Complete |
| 6 | Faculty/Mentor App | ✅ Complete |
| 7 | Student (External Student) App | ✅ Complete |
| 8 | Gmail Authentication Integration | ✅ Complete |
| 9 | Backend API Setup | ✅ Complete |
| 10 | Frontend-Backend Integration | 🔄 In Progress |

---

## Backend Setup Checklist

- [ ] Install Node.js dependencies: `cd Backend/Node_Backend && npm install`
- [ ] Create Firebase project at console.firebase.google.com
- [ ] Enable Google Sign-In in Authentication section
- [ ] Create Firestore database
- [ ] Download service account key → save as `Backend/Node_Backend/serviceAccountKey.json`
- [ ] Configure `Backend/Node_Backend/.env` with Firebase credentials
- [ ] Build TypeScript: `npm run build` (optional for dev)
- [ ] Start backend server: `npm run dev` (development with hot-reload)
- [ ] Test health check: `curl http://localhost:3000/health`
- [ ] Verify TypeScript compilation: `npm run type-check`

---

## Frontend Setup Checklist

- [ ] Configure `ReactNative_App/VISION/.env` with the Backend API URL (LAN IP on a physical device)
- [ ] Create the development build — `eas.json` plus `npx expo run:android`. Expo Go cannot load this app's native modules (`VISION.md` ADR-005)
- [ ] Build the email + password sign-up and sign-in screens
- [ ] Build the staff sign-in screen (employee ID + password)
- [ ] Route by role claim after sign-in; delete `switchRole()`
- [ ] Move tokens from AsyncStorage to `expo-secure-store`
- [ ] Test backend API calls from the app end to end
- [ ] *Later, optional:* re-enable Google Sign-In — needs the Android SHA-1 registered, a real `google-services.json`, and Android/iOS OAuth client IDs

---

## Notes

- Backend handles all business logic; the app is UI plus a Firebase session used only to mint tokens.
- Environment variables live in `.env` files and are not committed.
- The architecture diagram that used to sit here has moved to `VISION.md` §5.1, which is the one place it is maintained.

**Superseded by the 2026-09-10 entry above — kept so the log reads correctly in order:**

- *"All authentication logic moved from phone/OTP to Gmail/Google Sign-In."* Google is now an optional secondary path; email + password is primary, and staff sign in with an employee ID.
- *"Student role changed from sponsor-for-parents to external-student-for-projects."* Reversed: Student means an enrolled VIT-AP student who sponsors a parent's visit, and visiting students from other institutions are a Visitor subtype.
- *"Dummy auth mode available for testing without Firebase setup."* Being removed — it depends on the unsigned-token fallback that is the project's most serious security hole.
