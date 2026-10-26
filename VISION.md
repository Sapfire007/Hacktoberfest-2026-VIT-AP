# VISION — Source of Truth

**VIT Intelligent Surveillance & Identity Operations Network**
*Campus gate entry management for VIT-AP University.*

| | |
|---|---|
| **Owner** | Saptarshi — B.Tech CSE (Core), VIT-AP University (Reg. No. 24BCE7033) |
| **Status** | Active development — PoC toward MVP |
| **Last updated** | 2026-09-16 |
| **Delivery model** | Incremental, feature by feature, in consultation with the client |

> **Read this file first.** It is the single authoritative description of what VISION is,
> who its users are, how they authenticate, what actually works today, and why the major
> technical decisions were made. Requirements live in `PRD.md`. Screens, data model, and
> the API contract live in `Design.md`. Nothing is restated across those boundaries — see
> §8 Document ownership.

---

## 1. What VISION is

VIT-AP, like most large campuses, manages the hundreds of parents, vendors, guest faculty
and other visitors who pass through its gates every day with handwritten registers, ID
inspection, and phone calls to the faculty member being visited. It is slow at peak hours,
unsearchable afterwards, unable to catch a forged or repeat-flagged identity, and blind to
which vehicle arrived with which person.

VISION replaces that with a mobile-first platform. A visitor or parent registers once with
an email and password, enrols a facial biometric and a government ID photo, and submits a
visit request to the specific faculty member or mentor they are there to see. Once
approved, they receive a time-bound, QR-coded permit. At the gate, security verifies the
person's face against a locally cached biometric template and validates the permit
**entirely offline**, logs the vehicle's number plate, and closes the loop with a matching
exit scan. Every step is timestamped, searchable, and reportable.

**The seven-stage flow:**

```
1. Register     email + password, facial biometric, government ID
2. Request      purpose, host faculty, date/time window, optional vehicle
3. Approve      faculty/mentor approves or rejects from their phone
4. Permit       time-bound, signed QR permit issued to the requester
5. Entry        face match + permit validation at the gate, offline-capable
6. On campus    live "who is on campus" visibility for security and admin
7. Exit         matching exit scan closes the visit record
```

**The one-line goal:** every entry verified, every visit accountable, every gate
operational whether or not the internet is.

---

## 2. Current status — what is built vs. what is specified

This project has a large, detailed specification and a much smaller amount of working
software. The table below keeps that distinction honest. **A row marked *Spec only* has no
implementation in any service**, however thoroughly `PRD.md` and `Design.md` describe it.

### Built and working

| Capability | Where | Notes |
|---|---|---|
| Facial enrolment (multi-angle) | `Backend/Biometric_Backend` | DeepFace VGG-Face, RetinaFace detector, 1–4 images averaged into a composite embedding |
| Embedding encryption at rest | `Biometric_Backend/app/core/encryption.py` | Fernet (AES-128-CBC + HMAC-SHA256) |
| 1:1 face verification | `POST /api/v1/biometric/verify` | Cosine distance, threshold 0.40 |
| 1:N gate identification | `POST /api/v1/biometric/identify` | Searches the enrolled set |
| Guided biometric capture UX | `src/components/biometric/BiometricCapture.tsx` | Oval guide, state colours, countdown, auto-capture |
| Onboarding screen flow | `src/app/(onboarding)/` | Splash → role select → auth → biometric → govt ID → profile → consent → done |
| Neumorphic design system | `src/constants/neumorphic.ts` + `src/components/ui/` | ~26 components, hand-built |
| User profile persistence | `Backend/Node_Backend` + Firestore | `users` and `biometrics` collections |
| Requester / faculty / student app shells | `src/app/(main)`, `(faculty)`, `(student)` | Navigation and layout complete |
| **Staff sign-in, three role tabs** | `src/app/(onboarding)/staff-login.tsx` | Admin / Security / Faculty tabs. The tab is a hint only — routing follows the server-issued role claim |
| **Walk-in visitor registration** | `(security)/register.tsx` + `POST /api/gate/entries` | Name, phone, purpose, companions, vehicle, government-ID photo. Every record names the officer |
| **Signed QR gate passes** | `Node_Backend/src/core/gate-pass.ts` | HMAC-SHA256 over a compact claims payload. Self-contained, so exit verification needs no lookup |
| **Pass scanner (entry and exit)** | `(security)/scan-exit.tsx` + `POST /api/gate/scan` | One scanner for every pass; the server decides arrival or departure. Distinguishes signed-out, already-exited, expired, forged, too early, window over and withdrawn, each with its own screen. `/api/gate/exit` remains for exits only |
| **Permit check-in** | `(security)/permit-checkin.tsx` + `POST /api/gate/permits/{preview,check-in}` | An approved permit admits once, from 30 min before its window until the window ends. The officer sees the visitor's photo, host and window before confirming; records the ID checked (photo required when none is on file), vehicle and companions. Creates a `gate_entries` record (`source: permit`) linked to the request; the same QR signs them out |
| **Who is on campus** | `(security)/on-campus.tsx` + `GET /api/gate/on-campus` | Live roll, plus fallback lookup by pass code, plate or phone |
| **ANPR / number-plate recognition** | `Backend/ANPR_Backend` | YOLOv9-t detector + plate-specific OCR (fast-alpr), Indian-format post-processing; optional multi-frame voting |
| **Visit requests & approvals** | `routes/visit.routes.ts` + `services/visit.service.ts` | Create, list, approve/reject (host faculty only), cancel (requester only). Identity from the token, never the body; status changes in transactions |
| **Requester permits** | `visit.service.ts` → `PermitCard.tsx` | Approval issues a signed gate-pass token (kind `permit`, inside the signature) valid until the end of the visit window; the permit card renders it as a real QR. The request timeline shows check-in and sign-out; a used permit is no longer shown |
| **Student-sponsored visits** | `requests/new.tsx` + `visit.service.ts` | A student's request must name the parent or guardian (name, phone, relation); the permit is issued in that person's name (§3.4). Routed to a faculty member the student picks — mentor routing waits on student→mentor data |
| **Faculty directory API** | `routes/faculty.routes.ts` | Allow-listed fields only — faculty documents also hold password hashes |
| **Rate limiting** | `middleware/rateLimit.middleware.ts` | Failed logins per IP; authenticated traffic per user (campus NAT shares IPs) |
| **Admin console** | `src/app/(admin)/*` + `routes/admin-console.routes.ts` | Overview (live: on campus, today, overstays, alerts), entry/exit log, gate records with audited ID-photo view, analytics, reports, regular passes, watchlist, staff, visitor accounts, audit log. Responsive: sidebar on wide screens, hub on phones; also runs in a browser (§5.2) |
| **Entry / exit log** | `services/gate-log.service.ts` → `gate_events` | One row per entry, exit and denial, written in the same batch as the change; filterable and exportable |
| **Overstay alerts** | `gate.service.listOnCampus` / `GET /api/gate/overstays` | Inside past the pass's `expiresAt`. Red banner and filter on the security home and On Campus screens, a card on the admin overview |
| **Regular (multi-day) passes** | `services/recurring.service.ts` + `POST /api/passes/recurring` | Vendors, contractors, drivers, mess staff. Date range, weekdays, daily hours; one QR reused daily (scan in, scan out). Security issues up to 30 days at the gate (and checks them in), admin up to 180. Revocable |
| **Passes in the visitor's account** | `services/account-link.service.ts` + `GET /api/passes/mine` | A walk-in or regular pass reaches the visitor's app: automatically by *verified* email, or by phone number once the officer confirms the match. Home screen "Gate passes" |
| **Watchlist** | `services/watchlist.service.ts` + admin screen | Flags by phone and/or plate with a reason. At every gate action a match raises a red alert; the officer denies (logged) or admits with a written reason (logged, alerted to admin) |
| **Analytics** | `services/analytics.service.ts` | Visits by day and hour, peak hours, per gate, by entry type and category, visit length, overstays, watchlist counts, and OCR accuracy from `vehicle.source` (accepted vs corrected vs typed) |
| **Reports** | `services/report.service.ts` | Daily register (CSV, PDF) and gate log (CSV), downloaded through five-minute signed links; every download audited |
| **Audit log** | `services/audit.service.ts` → `audit_log` | Staff and account changes, watchlist edits, overrides and denials, passes issued/revoked/sent, ID photos viewed, reports downloaded (PRD FR-ADM-05) |
| **In-app plate scanner** | `components/anpr/PlateScanner.tsx` | One photo per scan, sent as base64 JSON; used by gate registration and Add Vehicle. Result always lands in an editable field |

### Partially built

| Capability | Status |
|---|---|
| Authentication | Rebuilt to the §3 model — email/password, employee-ID sign-in, custom claims, RBAC middleware. Verified server-side; **not yet run end-to-end on a device**, which needs a development build and a seeded admin |
| Google Sign-In | Wired as the optional secondary path, but not usable until the console configuration in §10 is done |
| Admin console gaps | Gate & device management and faculty-directory editing (FR-ADM-02/03) are not built; gates are a fixed list in `src/constants/gate.ts` |
| Dashboards | Screens render from `src/data/mockData.ts` fixtures, not live backend data |

### Spec only — not implemented anywhere

| Capability | Reality today |
|---|---|
| Offline gate verification | The pass format is self-contained and verifiable without a lookup, which is the hard half. The device-side half — a local cache, SQLite, and a sync layer — is not built, so a gate still needs the network to record an exit |
| Face match at the gate | The biometric service can identify 1:N, but no gate screen calls it. A walk-in is vouched for by an inspected government ID, not a face |
| Push notifications | The notifications screen renders an `EmptyState`. No messaging integration |

---

## 3. Roles and authentication — canonical

**This section is the single definition. `PRD.md` §5 and `Design.md` §2/§5 describe how it
looks and what it requires; they do not redefine it.**

VISION has two authentication tracks, split by whether the person is a member of the
institution or a guest of it.

| Role | Account created by | Signs in with | Gate-tracked | Role claim |
|---|---|---|---|---|
| **Visitor** | Self-signup | Email + password *(Google optional)* | Yes | `visitor` |
| **Parent / Guardian** | Self-signup | Email + password *(Google optional)* | Yes | `parent` |
| **Student** (VIT-AP internal) | Self-signup, institutional email | Email + password *(Google optional)* | No — already holds an ID card | `student` |
| **Faculty / Mentor** | Admin-provisioned | **Employee ID + password** | No | `faculty` |
| **Security Staff** | Admin-provisioned | **Employee ID + password** | No | `security` |
| **Admin** | Seeded, then admin-provisioned | **Employee ID + password** | No | `admin` |

### 3.1 The public track — email and password

Visitors, parents and students **register themselves**. Email plus password is the primary
credential: it needs no OAuth consent screen, no SHA-1 fingerprint, no redirect URI, and no
Google Cloud project configuration, which is why it is the path that gets built and fixed
first. Email verification is required before a visit request can be submitted.

"Sign in with Google" remains available to these three roles as an **optional convenience
button**. It is never the only way in, and no feature depends on it.

### 3.2 The institutional track — employee ID and password

Faculty, security staff and admins do **not** self-register. Their accounts are provisioned
by an admin against an employee ID, and they sign in with that ID rather than an email
address, because an employee ID is what campus staff actually carry and what HR records key
on. Passwords are stored only as hashes — bcrypt for accounts the backend creates, Argon2id
for the imported faculty directory. `staff.service.ts` verifies either, by hash prefix.

There is exactly one bootstrap exception: the first admin account is created by a seed
script, since there is otherwise no admin to do the provisioning.

**The faculty directory** is the `faculty` Firestore collection, one document per faculty
member, keyed by username (e.g. `srinivas170004`). It was imported from a credentials JSON
that is kept out of git (`Node_Backend/data/` is ignored), with each password hashed as
Argon2id (64 MB memory, 3 iterations, parallelism 4). Fields: `employeeId`, `name`, `email`,
`department`, `designation`, `username`, `passwordHash`, `role: "faculty"`, `status`,
`photoURL` (the VIT-AP website portrait, matched by the 5-digit employee number), `uid` once
the member has signed in, and timestamps. The import scripts are not in the repository. The
directory is only ever read through `/api/faculty`, which returns an allow-list of fields and
never `passwordHash`. The app's faculty picker ranks results with `src/utils/fuzzySearch.ts`.

### 3.3 Visitor subtypes

A Visitor account carries a subtype, which drives which fields the visit-request form asks
for:

`general` · `alumni` · `vendor` · `guest_faculty` · `external_student`

`external_student` covers students from other institutions visiting VIT-AP for projects,
internships, research collaboration or academic exchange under faculty supervision. It was
previously modelled as its own top-level role; it is now a visitor subtype, because such a
person is functionally a guest of the campus and needs the same biometric gate pipeline as
any other visitor. The supervising-faculty routing behaviour is retained on the subtype.

### 3.4 Who is gate-tracked

Only **Visitors and Parents** pass through the biometric entry/exit pipeline. Internal
students, faculty, security and admin already hold institutional access via ID cards and
hostel systems, which this system explicitly does not duplicate or replace.

Internal students hold accounts for one active function: **sponsoring a visit** for a
parent or guardian, which pre-fills the request and routes it to the student's assigned
mentor.

### 3.5 Token model

Every authentication path terminates in a **real Firebase ID token**, so the backend has
exactly one verification routine and one authorization source.

```
Email + password  →  Firebase Auth signInWithEmailAndPassword  →  getIdToken()  ┐
Google (optional) →  GoogleSignin → signInWithCredential       →  getIdToken()  ├→  Bearer <Firebase ID token>
Employee ID       →  POST /api/auth/staff/login                                 │
                     → backend bcrypt-verifies the credential                   │
                     → admin.auth().createCustomToken(uid, { role })            │
                     → app signInWithCustomToken() → getIdToken()               ┘
```

The employee-ID track deliberately bridges into the same Firebase session rather than
introducing a second, parallel JWT scheme. One token type means one middleware, one place
where authorization is decided, and no ambiguity about which credential a request carries.

**The role lives in a Firebase custom claim**, set only by the server. It is never read
from a request body, and never trusted from client state. This is the rule that prevents
the privilege escalation the earlier design allowed.

---

## 4. Repository map

```
E:\VISION\
├── VISION.md               ← you are here: identity, decisions, architecture, status
├── PRD.md                  ← requirements, FR-IDs, NFRs, KPIs, roadmap
├── Design.md               ← screen specs, data model, API contract, RBAC matrix
├── progress-tracker.md     ← dated changelog and task checklist
│
├── Backend/
│   ├── Node_Backend/       TypeScript · Express 5 · Firestore · port 3000
│   │   ├── src/config/firebase.admin.ts   Firebase Admin init, token verification
│   │   ├── src/middleware/                authentication, RBAC
│   │   ├── src/routes/                    /api/auth/*, /api/admin/*
│   │   ├── src/services/                  Firestore access
│   │   └── src/types/index.ts             the schema, as TypeScript interfaces
│   │
│   ├── Biometric_Backend/  Python 3.11 · FastAPI · DeepFace · port 8001
│   │   ├── app/core/           face engine, encryption, validators
│   │   ├── app/api/routes/     enrollment, verification, health
│   │   ├── app/storage/        encrypted embedding store
│   │   └── .deepface/weights/  VGG-Face weights, committed via Git LFS
│   │
│   └── ANPR_Backend/       Python 3.11 · FastAPI · ONNX Runtime · port 8002
│       ├── app/core/pipeline.py      YOLO plate detector + plate OCR (fast-alpr)
│       ├── app/core/postprocess.py   Indian plate grammar, confusion correction, voting
│       ├── app/api/routes/anpr.py    /read-base64 (app), /read (upload), /read-frames (voted)
│       └── scripts/                  check_gpu, benchmark, prepare_dataset, finetune_*
│
├── ReactNative_App/VISION/ TypeScript · Expo SDK 57 · React Native 0.86 · port 8081
│   ├── src/app/                expo-router file-based routes
│   │   ├── (onboarding)/       splash, role select, sign-in/sign-up, staff tabs, biometric
│   │   ├── (main)/             visitor / parent shell
│   │   ├── (faculty)/          approval inbox
│   │   ├── (student)/          sponsor flow
│   │   ├── (security)/         gate: register, plate-scan, pass, scan-exit, on-campus
│   │   └── (admin)/            placeholder shell
│   ├── src/components/ui/      neumorphic design system
│   ├── src/context/            AuthContext, AppContext
│   └── src/services/           api.service.ts, biometric.api.ts
│
└── Dry_Test/               experiments and scratch work
```

The four services are independent. The app is the only client that talks to any of the
three backends; none of them calls another. The app relays the encrypted embedding from the
biometric service to the Node service for storage, and relays a plate string from the ANPR
service into the gate form — where an officer can still overwrite it.

---

## 5. Architecture as built

### 5.1 Service topology

```
        ┌────────────────────────────────────┐
        │  React Native App                  │  Expo SDK 57 · expo-router
        │  requester · faculty · student ·   │
        │  security · admin                  │
        └──┬──────────────┬───────────────┬──┘
           │              │               │
   Bearer  │              │  multipart    │  multipart
   Firebase│              │  face images  │  plate frames
   ID token▼              ▼               ▼
   ┌──────────────────┐  ┌────────────────────┐  ┌──────────────────────┐
   │  Node_Backend    │  │ Biometric_Backend  │  │  ANPR_Backend        │
   │  Express  :3000  │  │ FastAPI  :8001     │  │  FastAPI  :8002      │
   │  Firebase Admin  │  │ DeepFace VGG-Face  │  │  YOLOv9-t + plate OCR│
   │  gate passes     │  │ Fernet embeddings  │  │  ONNX Runtime / CUDA │
   └────────┬─────────┘  └────────────────────┘  └──────────────────────┘
            │
            ▼
   ┌────────────────────────────────────────────┐
   │  Firebase                                  │
   │   · Authentication  identity, claims,      │
   │                     custom tokens          │
   │   · Cloud Firestore users, biometrics,     │
   │                     staff_credentials      │
   └────────────────────────────────────────────┘
```

**The rule the app follows:** all identity and data operations go through `Node_Backend`.
The app holds a Firebase session for token minting only — it never writes to Firestore
directly.

**The biometric service requires sign-in.** It stores face templates, so an open endpoint
let anyone on the network enrol, replace or delete anyone's. Every request carries the
caller's Firebase ID token, and the service asks `Node_Backend` (`GET /api/auth/session`)
whose it is, so there is still one place a token is verified (§3.5). A user enrols,
re-enrols and deletes only their own face. Checking another user's status or verifying a
face is limited to security and admin; deletion to admin; 1:N identification to security and
admin. `REQUIRE_AUTH=false` restores the open behaviour for local experiments. Node must be
running for enrolment to work.

**The ANPR service stays unauthenticated by design.** It holds no data and issues no
credential: it returns a string read off a plate, and the officer decides what to do with
it. It is limited instead: no browser origins by default, a size check before decoding, and
no internal error text in responses. Both Python services are reachable only on the campus
network, and serve their API docs only with `DEBUG=true`.

### 5.2 Running it

Three terminals. Order does not matter, but the app needs both backends reachable to do
anything past onboarding's local steps.

Biometric service — needs the Python 3.11 venv, not the system Python:

```bash
cd Backend/Biometric_Backend && venv_deepface/Scripts/activate && uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Number plate recognition — its **own** venv, not the biometric one (ADR-006):

```bash
cd Backend/ANPR_Backend && venv/Scripts/activate && uvicorn app.main:app --host 0.0.0.0 --port 8002
```

First time on a machine, before that: create the environment, install, and verify the GPU
is actually being used — `onnxruntime` falls back to the CPU silently, and `check_gpu.py`
exists to break that silence.

```bash
cd Backend/ANPR_Backend
python -m venv venv
venv/Scripts/activate
pip install -r requirements.txt
python scripts/check_gpu.py            # optionally: ... check_gpu.py path/to/a/car/photo.jpg
```

Only the security gate screens call this service. Everything else in the app works with it
stopped, and the plate field stays typeable.

Node API:

```bash
cd Backend/Node_Backend && npm run dev
```

`GATE_PASS_SECRET` must be set before a gate pass can be issued or scanned — there is no
default, because a shared default key is the same as no signature. Generate one with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Seed the three demo staff accounts once per Firebase project, so each tab on the staff
sign-in screen has a working account behind it:

```bash
cd Backend/Node_Backend && npm run seed:demo-staff
```

| Role | Employee ID | Password |
|---|---|---|
| Admin | `VITAP-ADM01` | `VisionAdmin@2026` |
| Security | `VITAP-SEC01` | `VisionSecurity@2026` |
| Faculty | `VITAP-FAC01` | `VisionFaculty@2026` |

These are development fixtures. They are published here and prefilled in the app under
`__DEV__`, so they protect nothing; the seed script refuses to run with `NODE_ENV=production`.

Mobile app — **a development build, not Expo Go** (ADR-005). Expo Go cannot load
`@react-native-firebase` or `@react-native-google-signin`; opening the app in it fails at
import time with `Native module ... is not registered`, not a runtime error — there is no
code fix for that message, only a dev build.

The native Android project (`android/`) is gitignored and generated fresh by `expo
prebuild` — nothing under it is ever committed, including `local.properties` and any
Gradle daemon pin. **The first build on a machine, or after any `expo prebuild --clean`,
needs the two one-time steps below before the actual build command.**

```bash
# 1. One-time per machine (or after a clean prebuild regenerates android/):
#    point Gradle at the Android SDK. Skip this if ANDROID_HOME is already exported.
cd ReactNative_App/VISION
npx expo prebuild --platform android    # only if android/ doesn't exist yet
echo "sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk" > android/local.properties
#    (forward slashes even on Windows — a backslash-escaped Windows path in a .properties
#    file gets misparsed by Gradle: "filename, directory name, or volume label syntax is
#    incorrect")

# 2. Build once and install on a running emulator or a USB-connected device:
npx expo run:android
```

**After that first build**, day-to-day development does not rebuild the native app —
Metro fast-refresh works exactly like Expo Go once the dev client is installed:

```bash
npx expo start --dev-client
```

Only re-run `npx expo run:android` when a native dependency changes (added, removed, or
its native config changed) — not on ordinary code edits.

**If the build fails with `A restricted method in java.lang.System has been called`**
during a CMake/native-module configure step, Gradle's daemon has been pinned to a JDK
newer than this toolchain supports (JDK 22+ enforces native-access restrictions that break
the NDK/CMake steps here). Check for a stray
`android/gradle/gradle-daemon-jvm.properties` — it is not part of the standard template
and only appears if something ran `gradlew updateDaemonJvm`. Delete it; Gradle falls back
to `JAVA_HOME` (this project is built and tested against **JDK 17**).

**Emulator vs. physical device, and which backend URL to use:**
`src/config/backend.ts` resolves the API base URL automatically — an explicit
`EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_BIOMETRIC_API_BASE_URL` in `.env` always wins;
otherwise it defaults to `10.0.2.2` (the Android emulator's alias for the host machine),
which is right for `npx expo run:android` on an emulator but wrong for a physical device.
For a physical device, either set the LAN IP explicitly in `.env`, or over USB run:

```bash
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8001 tcp:8001
adb reverse tcp:8002 tcp:8002
```

— which lets the device treat `localhost` as the host machine, no IP or `.env` edit
needed. See `.env.example` for both paths spelled out.

Health checks: `http://localhost:3000/health`, `http://localhost:8001/api/v1/health` and
`http://localhost:8002/api/v1/health`. Both Python services publish OpenAPI docs at `/docs`.
The ANPR service also has `/api/v1/ready`, which loads the models if they are not loaded and
then reports — call it to warm a freshly restarted service before a car is at the barrier.

DeepFace requires **Python 3.11**; TensorFlow does not support 3.14. Model weights are
committed under `.deepface/weights/` via Git LFS and `app/main.py` pins `DEEPFACE_HOME` to
the project directory, so nothing is downloaded to the user's home folder at first run.

### 5.3 Environment variables

Each service ships a `.env.example`. The variables that matter:

| Service | Variable | Purpose |
|---|---|---|
| Node | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Admin SDK credentials — or point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account JSON instead |
| Node | `PORT`, `NODE_ENV`, `CORS_ORIGINS` | Server. Outside `NODE_ENV=development`, only `CORS_ORIGINS` may call from a browser, and with it unset none can. 500 responses carry error details only in development |
| Node | `STUDENT_EMAIL_DOMAINS` | Optional, comma-separated. When set, only addresses in these domains may register as `student` (§3) |
| Node | `FIRESTORE_COLLECTION_*` | Collection name overrides |
| Node | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | Per-user budget for authenticated API calls (default 120/min) |
| Node | `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_PUBLIC_MAX`, `TRUST_PROXY` | Failed-login and unauthenticated limits per IP; `TRUST_PROXY` only behind a reverse proxy |
| Node | `GATE_PASS_SECRET` | **Required for the gate.** HMAC key that signs QR passes. No default — at least 32 characters. Rotating it invalidates every pass in circulation, so rotate between shifts, not during one |
| Biometric | `BIOMETRIC_ENCRYPTION_KEY` | **Required.** Fernet key — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Missing with `DEBUG=false`, the service refuses to start; with `DEBUG=true` it uses a throwaway key, which it never prints |
| Biometric | `REQUIRE_AUTH`, `NODE_API_BASE_URL` | Sign-in on every request, verified by Node at `NODE_API_BASE_URL` (default `http://localhost:3000/api`). `false` = the old open behaviour, local experiments only |
| Biometric, ANPR | `CORS_ORIGINS` | Browser origins allowed to call. Default empty (none); the app is native and needs none |
| Biometric | `MODEL_NAME`, `DETECTOR_BACKEND`, `DISTANCE_METRIC`, `VERIFICATION_THRESHOLD` | Recognition tuning |
| ANPR | `DETECTOR_MODEL`, `OCR_MODEL`, `DETECTOR_CONFIDENCE`, `OCR_MIN_CONFIDENCE` | Which models, and when a read is flagged low-confidence |
| ANPR | `DEVICE` | `auto` / `cuda` / `cpu`. `auto` uses CUDA when onnxruntime-gpu can see a device |
| ANPR | `PLATE_COUNTRY` | `IN` applies the Indian plate grammar — positional confusion correction and format validation. Empty returns raw OCR |
| ANPR | `SAVE_CROPS`, `CROP_STORAGE_PATH` | Writes every detected plate crop to disk, to build a fine-tuning set from real gate traffic. **Off by default** — these are photographs of real vehicles |
| ANPR | `OCR_MODEL_PATH`, `OCR_CONFIG_PATH`, `DETECTOR_MODEL_PATH` | Point at a locally fine-tuned model instead of the hub's |
| App | `EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | **Browser build only** (the admin console via `npx expo start --web`). The Firebase *web app* config, used by `services/firebase.auth.web.ts`. Public identifiers, not secrets |
| App | `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_BIOMETRIC_API_BASE_URL`, `EXPO_PUBLIC_ANPR_API_BASE_URL` | Backend endpoints. **Optional** — `src/config/backend.ts` defaults to `10.0.2.2` (the Android emulator's host alias) when unset. Set explicitly to the machine's LAN IP for a physical device, or use `adb reverse` instead (§5.2) |
| App | `EXPO_PUBLIC_ANPR_API_BASE_URL` | The plate reader. Only the gate screens use it; unset is fine if you are not testing ANPR |
| App | `EXPO_PUBLIC_ENABLE_DEMO_LOGIN` | `1` offers the demo staff credentials as a one-tap prefill. A development build already does; set this only for a demo build |
| App | `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` | Only for the optional Google button |

Anything prefixed `EXPO_PUBLIC_` is **embedded in the app bundle and readable by anyone who
installs it**. No secret, key or credential belongs there.

### 5.4 A note on Expo SDK 57

Expo has changed substantially. Read the exact versioned documentation at
<https://docs.expo.dev/versions/v57.0.0/> before writing app code — patterns from older SDKs
and from general search results are frequently wrong for this version.

---

## 6. Decision log

Each decision records what was chosen, why, what it costs, and what would justify
revisiting it.

### ADR-001 — React Native + Expo, not Flutter

**Status:** Decided, 2026-09-10.

**Context.** Both `PRD.md` §4.4 and `Design.md` §7.2 listed "Flutter, React Native" as an
open shortlist while the codebase had already committed to React Native. With Google
authentication failing on mobile, the question was raised of whether Flutter would be a
better fit and whether to migrate.

**Decision.** Stay on React Native with Expo.

**Reasoning.** None of the current breakage is caused by React Native. The auth failures are
Google Cloud console configuration, a token-type mismatch between app and backend, and an
attempt to run native-only modules inside Expo Go — Flutter would meet every one of those
identically, since `google_sign_in` also requires an SHA-1 fingerprint, also requires a real
build, and the backend would still be verifying the wrong token type. Against that, a
migration means rebuilding roughly 12,300 lines of TypeScript, 33 routes, and a hand-built
neumorphic component library that has no direct Flutter analogue — Flutter's shadow model
does not reproduce the dual inset/outset technique the design system is built on. That is an
estimated four to six weeks for zero new user-facing capability, inside a 12-week academic
delivery cycle that is already partly spent.

**In Flutter's favour, and acknowledged:** more consistent rendering across low-end Android
devices, a smoother first-party Firebase integration, and a more mature offline persistence
story (`drift`, `isar`). These are real, and they are not worth a rewrite at this point in
the project.

**Consequences.** The remaining unbuilt hard features are all served by mature React Native
packages: `expo-sqlite` for the offline permit cache, `expo-camera` barcode scanning for QR,
`expo-notifications` for push, and `react-native-vision-camera` with ML Kit for ANPR. The
neumorphic design system is preserved. The team stays in one language across app and Node
backend.

**What would reopen this.** On-device face matching at the gate proving too slow in React
Native to hit the sub-2-second verification target; or the gate device app growing heavy
enough on-device ML that a separate native or Flutter build for that surface alone becomes
worth its own maintenance.

### ADR-002 — Firebase Authentication as the sole identity provider

**Status:** Decided.

**Context.** The system needs email/password for the public, employee-ID credentials for
staff, and an optional Google button — with a near-zero budget.

**Decision.** All three paths terminate in a Firebase session and a Firebase ID token. No
second JWT scheme is introduced.

**Consequences.** One verification routine on the backend, one authorization source (custom
claims), free at PoC scale, and password reset, email verification and session refresh come
built in rather than being written by hand. The cost is a dependency on Google's identity
service, which ADR-004 already accepts for data storage.

### ADR-003 — Employee-ID login via a backend-issued custom token

**Status:** Decided.

**Context.** Firebase Authentication has no native concept of "log in with an employee ID."
Two workarounds exist: synthesise an email address such as `EMP1234@staff.vision.local` and
use the normal email/password flow, or verify the credential server-side and mint a custom
token.

**Decision.** Verify server-side, mint a custom token.

**Reasoning.** The synthetic-email approach leaks a fake domain into the identity record,
makes password reset incoherent, and quietly couples the employee ID format to an email
grammar. Verifying server-side keeps the employee ID as a first-class credential in
Firestore alongside the department, active flag and lockout state, and it is the only
approach that lets an admin deactivate a staff account instantly.

**Consequences.** `staff_credentials/{employeeId}` holds the bcrypt hash; the app never
touches it. The backend gains one endpoint that accepts a password. Staff password reset is
admin-initiated rather than self-service by email, which is correct for institutional
accounts.

### ADR-004 — Firestore, despite a relational data model

**Status:** Decided, with a known tension.

**Context.** `Design.md` §7.3 argues that the ER model is heavily relational and that a
relational database is the better fit. The implementation uses Cloud Firestore.

**Decision.** Stay on Firestore for the PoC.

**Reasoning.** It is already integrated, it shares an SDK and a project with Firebase
Authentication, it has a usable free tier, and it needs no server to operate or back up.

**Consequences.** Joins have to be denormalised by hand, and reporting queries across visits,
permits and gate logs will become awkward as those modules land. The relational argument in
`Design.md` §7.3 stands on its merits and is not withdrawn.

**What would reopen this.** The reports and analytics module needing multi-entity aggregate
queries that Firestore cannot serve without a per-report denormalised collection.

### ADR-005 — A development build is required; Expo Go is not supported

**Status:** Decided.

**Context.** The app declares `@react-native-firebase/app`, `@react-native-firebase/auth`
and `@react-native-google-signin/google-signin` as config plugins. These are native modules
that Expo Go cannot load, so the app has never actually been able to run there — yet
substantial effort went into browser-based OAuth workarounds whose only purpose was Expo Go
compatibility.

**Decision.** Build and distribute a development build. Delete the Expo Go accommodation
code.

**Consequences.** A one-time build step before the first run on a new device. After that,
Metro fast-refresh behaves exactly as it did in Expo Go — this changes the setup cost, not
the daily development loop.

---

### ADR-006 — ANPR as a third service, not a module in the biometric one

**Status:** Decided, 2026-09-16.

**Context.** Number plate recognition needs a plate detector and a character recogniser.
The obvious home was `Biometric_Backend`: it is already a Python FastAPI service, already
does computer vision, and already runs on the same machine.

**Decision.** A separate service, `ANPR_Backend`, on port 8002, with its own virtual
environment.

**Reasoning.** The dependency trees are not compatible in practice. DeepFace pulls in
TensorFlow, which pins particular CUDA and cuDNN versions; `fast-alpr` runs on
`onnxruntime-gpu`, which pins different ones. Installed side by side, whichever loads
second does not fail — it prints a warning and silently falls back to the CPU. That failure
mode is the argument: a gate that has quietly become fifteen times slower looks exactly
like a gate that is working, and nobody investigates a system that is merely slow. Separate
environments make the conflict impossible rather than intermittent.

Two smaller reasons point the same way. The services have different failure consequences —
a crash in plate reading should not take face matching down with it — and different
hardware futures, since a plate reader may eventually run on a camera-side box at the gate
while face matching stays on a server.

**Against it, and acknowledged:** a third service to start, a third port to configure, a
third health check. That is real operational cost for a project run by one person, and it is
the price of the failure mode above being loud instead of quiet.

**Consequences.** Three terminals rather than two, and `scripts/check_gpu.py` exists
specifically to make the CPU fallback visible, because the library will not say so itself.

---

### ADR-007 — Gate passes are signed tokens, not record identifiers

**Status:** Decided, 2026-09-16.

**Context.** The QR code on a gate pass has to carry something. The simple option is the
entry's Firestore document id: short, dense, trivially generated.

**Decision.** The QR carries a self-contained token — `VP1.<claims>.<HMAC-SHA256>` — holding
the entry id, pass code, visitor name, party size, plate and expiry, signed with
`GATE_PASS_SECRET`.

**Reasoning.** An id forces a database lookup on every exit scan, and the campus link being
down is precisely the condition the product claims to work through (§1). A signed token
lets a gate device verify authenticity and expiry with nothing but the shared key, which
makes offline verification a matter of shipping the key to the device rather than a
redesign. It also means a forged QR is rejected before any database is touched, so a
tampered code cannot be used to probe for valid record ids.

HMAC rather than a public-key signature because issuer and verifier are both ours. The only
thing asymmetric signing would buy is verification without the ability to issue, which
nobody here needs, and it would cost key distribution to every gate device.

**Against it, and acknowledged:** a ~190-character QR rather than a ~20-character one, which
is denser to scan; and rotating the key invalidates every pass in circulation, so it has to
be done between shifts rather than during one. Both are stated in §5.3.

**Consequences.** The offline half of the work is now split cleanly: the *format* supports
offline verification today, and what remains is the device-side cache and sync layer
(Phase 7). §2 records that distinction rather than claiming the whole thing.

---

## 7. Incremental delivery

This project is built in phases, with scope for each phase confirmed with the client before
work starts. The specification deliberately runs ahead of the implementation; §2 is what
keeps the difference visible.

### How a feature enters the project

```
Client consultation
      ↓
PRD.md          a requirement with an FR-ID and a priority
      ↓
Design.md       screen spec, data model change, API contract
      ↓
Build           app and/or backend
      ↓
VISION.md §2    status table updated to reflect what now actually works
```

No feature skips the FR-ID step. It is what makes a requirement traceable back to the
conversation that produced it, and what stops the specification and the software drifting
apart again.

### Phases

| Phase | Scope | Depends on | Status |
|---|---|---|---|
| **0** | Specification baseline: PRD, Design, this document | — | Done |
| **1** | Biometric enrolment and verification service | Python 3.11 ML environment | Done |
| **2** | Onboarding UX, neumorphic design system, app shells | — | Done |
| **3** | **Authentication rebuild** — email/password, employee-ID login, custom claims, RBAC | Development build; seeded admin | Code complete; on-device verification pending |
| **4** | Visit requests and the approval workflow | Phase 3 | Next |
| **5** | QR permits — signed payload, generation, scanning | Phase 4 | Done for officer-issued gate passes; the requester-side permit waits on Phase 4 |
| **6** | Security gate app, entry/exit logging | Phase 5 | Done — walk-in registration, QR issue, permit check-in, one scanner for entry and exit, on-campus roll. Face match at the gate is not wired in |
| **7** | Offline cache and sync — the core differentiator | Phase 6 | Next — the pass format already verifies offline (ADR-007); the device-side cache does not exist |
| **8** | ANPR / number-plate recognition | Phase 6 | Service and in-app scanner done. Accuracy on real VIT-AP gate traffic is unmeasured; camera placement still needs client sign-off |
| **9** | Admin console, reports, watchlist, audit log | Phase 6 | Done, except gate/device management and faculty-directory editing |
| **10** | Push notifications | Phase 4 | Planned |

Phases 8 and 9 carry open questions for the client — camera placement and lighting for ANPR,
and how much of the admin console needs to be a web dashboard rather than a mobile screen.
Those are recorded in `PRD.md` §14.

**On ANPR accuracy.** The pipeline runs and reads plates, but no number has been measured
against real VIT-AP gate photographs, so none is claimed here. The order of work is fixed and
is the opposite of the tempting one: collect crops (`SAVE_CROPS=true`), label them
(`scripts/prepare_dataset.py triage`), **measure** (`scripts/benchmark.py --labels ...`), and
only then consider fine-tuning. The shipped models are trained across 65+ countries and are
usually already good enough; the positional confusion correction in `postprocess.py` fixes
most of what remains for free. Fine-tuning below roughly a thousand corrected samples
reliably makes the model worse. `scripts/finetune_ocr.py` and `scripts/finetune_detector.py`
say the same thing in their own docstrings, and the benchmark's confusion table is what
decides which of the two — if either — is worth running.

---

## 8. Document ownership

The repository previously carried around fourteen overlapping markdown files; the
authentication flow alone was described five separate times, in versions that contradicted
each other. The rule below is what prevents that returning.

| Document | Owns | Does not contain |
|---|---|---|
| **`README.md`** | The project's entry point: prerequisites, first-time setup, the daily run commands for all four services, and troubleshooting | Decisions, requirements, screen specs. It links to this file rather than restating it |
| **`VISION.md`** | Project identity, the role and auth model, decision log, as-built architecture, run commands, delivery phases, current status | Requirement tables, screen specs, database field lists |
| **`PRD.md`** | Requirements with FR-IDs, NFRs, user stories, personas, KPIs, risks, roadmap detail | Architecture decisions, setup instructions, screen layouts |
| **`Design.md`** | Screen specifications, information architecture, design tokens, ER data model, API contract, RBAC matrix | Requirement IDs, decision rationale, environment setup |
| **`progress-tracker.md`** | Dated changelog and task checklists | Anything durable — it is a log, not a specification |
| **Component READMEs** | Setup and troubleshooting for that one service | Product context, cross-service architecture |

**When something changes, update it in exactly one place and link from the others.**

Do not create a new markdown file to record a fix, a setup procedure, or a status update.
That habit is what produced `FIX_400_ERROR.md`, `STATE_MISMATCH_FIX.md`,
`FIX_GOOGLE_OAUTH_BLOCKED.md`, `EXPO_GO_SIMPLE.md`, `SETUP_COMPLETE.md` and their siblings —
nine documents describing one unresolved problem, none of which agreed with the others.
Fixes belong in the code and in `progress-tracker.md`; decisions belong in §6 above.

---

## 9. Constraints

| Constraint | Detail |
|---|---|
| **Budget** | Near-zero — around ₹800–1,000 total. Free tiers and open-source libraries first, always |
| **Connectivity** | Gate devices cannot assume internet at the moment of verification. This is a hard requirement, not a nice-to-have |
| **Devices** | Assume mid- and low-range Android phones for visitors; adoption depends on it working on what people already own |
| **Timeline** | A 12-week academic build cycle |
| **Privacy** | Biometrics are stored only as encrypted mathematical embeddings, never as raw images. Government IDs are held as a photo of a document, the same way a paper register would — there is no UIDAI/Aadhaar verification |

---

## 10. Known issues and security debt

Recorded openly so they are fixed rather than forgotten.

### Why Google authentication is currently broken on mobile

Four independent causes, in the order they bite:

1. **The app cannot run in Expo Go at all.** It declares three native-only config plugins,
   yet the entire auth path is built around detecting and accommodating Expo Go. See ADR-005.
2. **Unstable redirect URIs.** `useProxy: true` in the `expo-auth-session` path is a no-op in
   the current version, so the redirect URI is unpredictable — the source of the recurring
   `redirect_uri_mismatch` (HTTP 400) and `state_mismatch` errors.
3. **A token-type mismatch.** The app sends a **Google** ID token to a backend that calls
   Firebase Admin `verifyIdToken`, which only accepts **Firebase** ID tokens. This can never
   succeed.
4. **Missing console configuration.** No Android SHA-1 is registered, `google-services.json`
   carries a placeholder API key, and the Android and iOS OAuth client IDs are `.env`
   placeholders.

The fix is the Phase 3 model in §3, which makes email/password the primary path — that path
needs none of the console configuration above — and reduces Google to an optional button
built on a correct token contract.

### Security debt

Items marked *Phase 3* are in scope for the current authentication work.

| Issue | Where | Severity |
|---|---|---|
| ~~Unsigned-JWT fallback accepted forged tokens~~ | `Node_Backend/src/config/firebase.admin.ts` | **Fixed** — fallback deleted; a forged unsigned token now returns 401 |
| ~~Role taken verbatim from the client request body~~ | `Node_Backend/src/routes/auth.routes.ts` | **Fixed** — clamped server-side to `visitor\|parent\|student`; the role lives in a custom claim |
| ~~No RBAC middleware~~ | `Node_Backend/src/middleware/rbac.middleware.ts` | **Fixed** — `requireRole` / `requireSelfOrRole`; biometric reads restricted to owner, security and admin |
| ~~`switchRole()` replaced the authenticated user with a mock~~ | `src/context/AuthContext.tsx` | **Fixed** — removed, along with the demo role-switcher UI |
| ~~Logout never signed out of Firebase or Google~~ | `src/context/AuthContext.tsx` | **Fixed** — signs out of both |
| ~~Tokens in AsyncStorage~~ | `src/context/AuthContext.tsx` | **Fixed** — moved to `expo-secure-store` |
| The dev-only `/api/dummy/*` routes, which minted custom tokens for arbitrary emails | removed | **Fixed** — deleted with the fallback they depended on |
| ~~Rate limiting configured in `.env` but no middleware installed~~ | `Node_Backend/src/middleware/rateLimit.middleware.ts` | **Fixed** — failed logins per IP, authenticated traffic per user |
| Firestore rules must deny all client access; the app previously read and wrote Firestore directly and unauthenticated, which only works with open rules | `Node_Backend/firestore.rules` | **High** until the deny-all rules are published |
| ~~Every biometric endpoint is unauthenticated, including `DELETE /api/v1/biometric/{user_id}`~~ | `Biometric_Backend` | **Fixed** — Firebase token on every request, verified by Node; users manage only their own face; `user_id` restricted to a plain id (it also escaped the store directory on Windows); `threshold_override` can only tighten matching |
| ~~Staff provisioning and faculty first sign-in adopted any existing Firebase account with the same email — an attacker could pre-register a staff member's address (or `<id>@staff.local`) and receive their role~~ | `staff.service.ts` | **Fixed** — staff and faculty get server-minted uids (`staff_<ID>`, `faculty_<username>`) with no email. `npm run audit:accounts` lists any account adopted before the fix |
| ~~Deactivated staff kept a working Firebase user (Google sign-in, password reset)~~ | `staff.service.ts` | **Fixed** — deactivation also disables the Firebase user |
| ~~"Must change password at first sign-in" was stored but never enforced — the app had no change-password screen~~ | app `RoleGuard` | **Fixed** — `(onboarding)/change-password` |
| ~~Demo staff accounts (published passwords) would sign in anywhere~~ | `staff.service.ts` | **Fixed** — refused when `NODE_ENV=production` |
| ~~ID uploads and gate ID photos accepted any content type; the `/profile` response returned the ID document, which the app cached in plain storage~~ | `auth.routes.ts`, `gate.service.ts` | **Fixed** — type allow-list checked against the file's bytes, size caps, document bytes kept out of responses |
| ~~Internal error messages in responses; reset links and query strings (report tokens, phone searches) in logs; 10 MB bodies parsed on every route before auth; an unused email-existence endpoint~~ | `server.ts`, `auth.routes.ts` | **Fixed** |
| Gate traffic is plain HTTP on the LAN | deployment | **Medium** — put the services behind TLS (a reverse proxy) before real use; release Android builds refuse cleartext anyway |
| Encrypted embeddings for live user IDs were committed | `Biometric_Backend/data/embeddings/` | Untracked and ignored; **still in git history** |
| A real faculty member's plaintext password was committed in several markdown files | git history (commit `c38ea2b`) | **High** — rotate it with `npm run reset:faculty-password -- --username <u>` (Node_Backend); it stays in history until the history is rewritten |


---

## 11. Glossary

| Term | Meaning |
|---|---|
| **Requester** | Any account that submits a visit request — Visitor, Parent/Guardian, or a Student sponsoring on a parent's behalf |
| **Host** | The faculty member or mentor a visit is directed to, who approves or rejects it |
| **Permit** | A time-bound, signed QR credential issued after approval |
| **Employee ID** | The institutional staff identifier used as the login credential for faculty, security and admin |
| **Custom claim** | Role metadata attached to a Firebase user by the server; the authoritative source for authorization |
| **Custom token** | A short-lived token minted by the backend and exchanged by the app for a Firebase session — the bridge for employee-ID login |
| **Embedding** | The mathematical face representation stored in place of a photograph |
| **Gate-tracked** | Subject to biometric verification at entry and exit; applies to Visitors and Parents only |
| **ANPR** | Automatic Number Plate Recognition |

---

*Requirements: `PRD.md` · Screens, data model and API: `Design.md` · Changelog: `progress-tracker.md`*
