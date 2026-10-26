<div align="center">

<img src="VIT-AP_University_logo.png" alt="VIT-AP University" width="180">

# VISION

**VIT Intelligent Surveillance & Identity Operations Network**

Campus gate entry management for VIT-AP University.

`Expo SDK 57` · `React Native 0.86` · `Node 24 / Express 5` · `Python 3.11 / FastAPI` · `Firebase`

</div>

---

> **This file gets you running.** For what VISION *is* — the role model, the decision log,
> the as-built architecture, and an honest account of what works versus what is only
> specified — read **[`VISION.md`](VISION.md)**. It is the single source of truth, and
> nothing here overrides it.

---

## Table of contents

- [What it does](#what-it-does)
- [Project state at a glance](#project-state-at-a-glance)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup — first time on a machine](#setup--first-time-on-a-machine)
  - [Running without a GPU](#running-without-a-gpu)
- [Running it — every day](#running-it--every-day)
- [Test credentials](#test-credentials)
- [Try the gate flow](#try-the-gate-flow)
- [Ports and health checks](#ports-and-health-checks)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Repository layout](#repository-layout)
- [Documentation map](#documentation-map)

---

## What it does

VIT-AP, like most large campuses, manages hundreds of daily visitors with handwritten
registers, ID inspection and phone calls. It is slow at peak hours, unsearchable
afterwards, and blind to which vehicle arrived with which person.

VISION replaces that. There are two ways in:

**The pre-registered path.** A visitor registers with an email and password, enrols a facial
biometric and a government ID, and requests a visit with a specific faculty member. Once
approved they receive a time-bound QR permit.

**The walk-in path.** Someone turns up without an account — a delivery driver, a parent
straight from the station, a contractor's crew. A security officer registers them at the
gate: name, phone, purpose, who is with them, what they arrived in, and a photograph of a
government ID the officer physically inspected. A signed QR pass is issued on the spot.

Either way, the same scan closes the record on the way out, which is what turns a register
of arrivals into an accountable *"who is on campus right now"*.

**The goal:** every entry verified, every visit accountable, every gate operational whether
or not the internet is.

---

## Project state at a glance

This project has a detailed specification and a smaller amount of working software. The
table keeps that difference visible rather than flattering.

| Area | State |
|---|---|
| Facial enrolment & 1:1 / 1:N verification | ✅ Working |
| Email/password + employee-ID authentication, RBAC | ✅ Working |
| Staff sign-in with Admin / Security / Faculty tabs | ✅ Working |
| Walk-in visitor registration at the gate | ✅ Working |
| Signed QR gate passes (issue, re-issue, exit scan) | ✅ Working |
| "Who is on campus" roll + lookup by code / plate / phone | ✅ Working |
| ANPR — number plate recognition service and in-app scanner | ✅ Working, **accuracy unmeasured** |
| Neumorphic design system (~26 components) | ✅ Working |
| Visit requests & faculty approvals | ⛔ Screens only, no backend |
| Requester-side QR permits (post-approval) | ⛔ Placeholder image |
| Offline gate verification | 🟡 Pass format verifies offline; device cache not built |
| Face match at the gate | ⛔ Service can do it; no gate screen calls it |
| Admin console | 🟡 Route group exists, screen is a placeholder |
| Push notifications, watchlist, reports | ⛔ Not started |

> ⚠️ **Not production-ready.** Nothing here has been run end-to-end on a device yet, ANPR
> accuracy on real VIT-AP plates has not been measured, and `NODE_ENV` is `development`
> with published demo credentials. This is ready to **test**, not to deploy.

---

## Architecture

Four independent pieces. The app is the only client that talks to the three backends; none
of them calls another.

```
        ┌────────────────────────────────────┐
        │  React Native App        :8081     │  Expo SDK 57 · expo-router
        │  visitor · parent · student ·      │
        │  faculty · security · admin        │
        └──┬──────────────┬───────────────┬──┘
           │              │               │
   Bearer  │              │  multipart    │  multipart
   Firebase│              │  face images  │  plate frames
   ID token▼              ▼               ▼
   ┌──────────────────┐  ┌────────────────────┐  ┌──────────────────────┐
   │  Node_Backend    │  │ Biometric_Backend  │  │  ANPR_Backend        │
   │  Express  :3000  │  │ FastAPI  :8001     │  │  FastAPI  :8002      │
   │  Firebase Admin  │  │ DeepFace VGG-Face  │  │  YOLOv9-t + plate OCR│
   │  gate passes     │  │ Fernet embeddings  │  │  ONNX (GPU or CPU)   │
   └────────┬─────────┘  └────────────────────┘  └──────────────────────┘
            │
            ▼
   ┌────────────────────────────────────────────┐
   │  Firebase — Auth (identity, claims)        │
   │             Firestore (users, biometrics,  │
   │             staff_credentials, gate_entries)│
   └────────────────────────────────────────────┘
```

**Two rules worth knowing before you read any code:**

1. **All identity and data operations go through `Node_Backend`.** The app holds a Firebase
   session for token minting only — it never writes to Firestore directly.
2. **The role lives in a Firebase custom claim, written only by the server.** It is never
   read from a request body and never trusted from client state.

The two Python services are deliberately unauthenticated. Neither holds data nor issues a
credential — one returns a distance between two faces, the other a string read off a plate.
Every decision that follows is made by `Node_Backend` against a verified token. They are
reachable only on the campus network.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 20+ | Tested on 24.14.0 |
| **Python** | **3.11 exactly** | TensorFlow does not support 3.12+. Both Python services need their own venv |
| **JDK** | **17** | JDK 22+ breaks the NDK/CMake step with a `restricted method in java.lang.System` error |
| **Android Studio + SDK** | — | For the emulator and `expo run:android` |
| **Git LFS** | — | The 580 MB VGG-Face weights are stored via LFS |
| **NVIDIA GPU** | **optional** | Only for ANPR, and only for speed. See [running without a GPU](#running-without-a-gpu) |
| **Firebase project** | — | Auth + Firestore enabled, with a service account |

> On Windows, `python --version` should report 3.11.x. The `py` launcher may not be
> installed — use `python -m venv` rather than `py -3.11 -m venv` if `py` is not found.

---

## Setup — first time on a machine

Five steps. Do them in order; later ones assume the earlier ones.

### 0. Clone with LFS

```bash
git lfs install
git clone <repo-url> VISION
cd VISION
git lfs pull
```

Verify the weights actually came down — a pointer file is ~130 bytes, the real thing is
580 MB:

```bash
ls -lh Backend/Biometric_Backend/.deepface/weights/vgg_face_weights.h5
```

### 1. Node backend — `:3000`

```bash
cd Backend/Node_Backend
npm install
cp .env.example .env
```

Edit `.env` and fill in:

- **Firebase Admin credentials** — either `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` +
  `FIREBASE_PRIVATE_KEY`, *or* point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account
  JSON file.
- **`GATE_PASS_SECRET`** — **required before any QR pass can be issued or scanned.** There
  is no default, because a shared default key is the same as no signature at all:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Then seed the accounts. The first admin is a one-off bootstrap (there is otherwise no admin
to provision the first admin):

```bash
npm run seed:admin -- --employee-id ADMIN001 --name "Campus IT" --password "<12+ chars>"
```

And seed the three demo staff accounts, so each tab on the staff sign-in screen has a
working account behind it:

```bash
npm run seed:demo-staff
```

### 2. Biometric backend — `:8001`

```bash
cd Backend/Biometric_Backend
python -m venv venv_deepface
venv_deepface/Scripts/activate        # Windows
# source venv_deepface/bin/activate   # macOS / Linux
pip install -r requirements.txt
cp .env.example .env
```

Generate the encryption key — **required**, and losing it makes every enrolled embedding
undecryptable:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Put that in `.env` as `BIOMETRIC_ENCRYPTION_KEY`. Full details in
[`backend_biometric_startup.md`](Backend/Biometric_Backend/backend_biometric_startup.md).

### 3. ANPR backend — `:8002` *(optional)*

A **separate** virtual environment from the biometric one, and this is not optional
tidiness. TensorFlow pins particular CUDA/cuDNN versions; `onnxruntime-gpu` pins different
ones. Side by side, whichever loads second does not crash — it silently falls back to the
CPU. See [`VISION.md`](VISION.md) ADR-006.

```bash
cd Backend/ANPR_Backend
python -m venv venv
venv/Scripts/activate
pip install -r requirements.txt       # ~2 GB with the CUDA runtime
cp .env.example .env
```

> **No NVIDIA GPU?** Same steps. `DEVICE=auto` (the default) falls back to the CPU
> automatically. See [running without a GPU](#running-without-a-gpu) below.

Then verify the GPU is *actually* being used. **Do not skip this:**

```bash
python scripts/check_gpu.py
```

`onnxruntime` does not raise when it cannot load CUDA — it warns, falls back to CPU, and
keeps working ~15× slower. A gate that has quietly become slow looks exactly like a gate
that is working. This script creates a real CUDA session and reports which provider it
actually got. It also downloads and caches the detector and OCR models on first run.

Point it at a real photo to see an actual read:

```bash
python scripts/check_gpu.py path/to/a/car/photo.jpg
```

Full details in
[`ANPR_backend_startup.md`](Backend/ANPR_Backend/ANPR_backend_startup.md).

> **This service is optional.** Only the gate's plate-scan screen calls it. With it stopped,
> everything else works and the plate field stays typeable.

#### Running without a GPU

Everything works without one. The GPU is a speed optimisation for ANPR alone — no feature
depends on it, and the other three services never used it.

The standard setup works on any machine: install `requirements.txt` and keep `DEVICE=auto`
(the default). It uses the GPU when CUDA is available and falls back to the CPU when it is
not. Check the `provider=` line in the startup log to see which it picked.

| | With an NVIDIA GPU | CPU only |
|---|---|---|
| Install | `requirements.txt` | `requirements.txt` (or `requirements-cpu.txt`, ~1.5 GB smaller) |
| `.env` | `DEVICE=auto` | `DEVICE=auto` |
| Per-frame latency | tens of ms | a few hundred ms |
| Accuracy | *identical* | *identical* |

The other services are unaffected: the Node API has no GPU path at all, and the biometric
service's DeepFace/TensorFlow stack runs on CPU perfectly well — enrolment and verification
take a few seconds per face rather than under one.

### 4. Mobile app — `:8081`

```bash
cd ReactNative_App/VISION
npm install
cp .env.example .env
```

Place your Firebase `google-services.json` at `ReactNative_App/VISION/google-services.json`.

**A development build is required — Expo Go will not work.** The app declares native config
plugins that Expo Go cannot load; it fails at import time with `Native module ... is not
registered`, which has no code fix. See [`VISION.md`](VISION.md) ADR-005.

```bash
npx expo prebuild --platform android      # only if android/ does not exist
```

Then point Gradle at your Android SDK — **forward slashes even on Windows**, a
backslash-escaped path gets misparsed:

```bash
echo "sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk" > android/local.properties
```

Build and install once, on a running emulator or a USB-connected device:

```bash
npx expo run:android
```

---

## Running it — every day

After that first build you do **not** rebuild the native app. Metro fast-refresh behaves
exactly as Expo Go did. Re-run `npx expo run:android` only when a native dependency changes.

Four terminals. Order does not matter.

**1 · Node API**
```bash
cd Backend/Node_Backend && npm run dev
```

**2 · Biometric service**
```bash
cd Backend/Biometric_Backend && venv_deepface/Scripts/activate && uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**3 · ANPR service** *(optional)*
```bash
cd Backend/ANPR_Backend && venv/Scripts/activate && uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
```

**4 · App**
```bash
cd ReactNative_App/VISION && npx expo start --dev-client
```

### Connecting a physical device

`src/config/backend.ts` defaults to `10.0.2.2` — the Android emulator's alias for the host
machine. That is wrong for a physical device. Either set your LAN IP in `.env`, or use
`adb reverse`, which avoids IP addresses entirely and does not go stale when you change
networks:

```bash
adb reverse tcp:3000 tcp:3000; adb reverse tcp:8001 tcp:8001; adb reverse tcp:8002 tcp:8002
```

---

## Test credentials

Created by `npm run seed:demo-staff`. Each backs one tab on the staff sign-in screen.

| Role | Employee ID | Password |
|---|---|---|
| Admin | `VITAP-ADM01` | `VisionAdmin@2026` |
| Security | `VITAP-SEC01` | `VisionSecurity@2026` |
| Faculty | `VITAP-FAC01` | `VisionFaculty@2026` |

> These are **development fixtures**. They are published in this repository and prefilled in
> the app under `__DEV__`, so they protect nothing. The seed script refuses to run with
> `NODE_ENV=production`. Before any real deployment, provision real accounts through
> `POST /api/admin/staff`.

Visitors, parents and students **self-register** in the app with email and password — no
seeding needed.

---

## Try the gate flow

The fastest way to see the new work end to end:

1. Open the app → **"Staff, Security or Admin?"** at the bottom of sign-in.
2. Pick the **Security** tab → tap the dev credential card to fill it in → **Sign in**.
3. **Register a visitor** — fill in name, phone and purpose.
4. Add an accompanying person or two with **+ Add person**.
5. Toggle **Vehicle** on → **Scan the number plate**, point the camera at a plate.
   *(The result lands in an editable field — correct it if it is wrong; that is the design,
   not a workaround.)*
6. Photograph any ID card → **Register & issue pass**.
7. You get a **QR pass**. Leave it on screen.
8. Back at the gate home → **Scan a pass to sign out** → scan that QR from another device
   or a screenshot.

You should see a green **SIGNED OUT**. Scan the same code twice and you get an amber
*already signed out* with the original exit time — not a silent overwrite, because that
timestamp is part of the audit record.

---

## Ports and health checks

| Service | Port | Health | API docs |
|---|---|---|---|
| Node API | 3000 | http://localhost:3000/health | — |
| Biometric | 8001 | http://localhost:8001/api/v1/health | http://localhost:8001/docs |
| ANPR | 8002 | http://localhost:8002/api/v1/health | http://localhost:8002/docs |
| Metro | 8081 | — | — |

ANPR also has `/api/v1/ready`, which loads the models if they are not loaded and then
reports — use it to warm a freshly restarted service before a car is at the barrier.

---

## Environment variables

Every service ships a `.env.example`. The ones that will stop you if unset:

| Service | Variable | Why |
|---|---|---|
| Node | `FIREBASE_*` or `GOOGLE_APPLICATION_CREDENTIALS` | The server exits at startup without them |
| Node | **`GATE_PASS_SECRET`** | No default. Passes cannot be issued or scanned without it. ≥32 chars |
| Biometric | **`BIOMETRIC_ENCRYPTION_KEY`** | Fernet key. Lose it and every enrolled embedding is undecryptable |
| ANPR | `DEVICE` | `auto` / `cuda` / `cpu` |
| ANPR | `SAVE_CROPS` | Writes plate crops for fine-tuning data. **Off by default** — real vehicle photos |
| App | `EXPO_PUBLIC_API_BASE_URL` etc. | Optional; defaults to `10.0.2.2` for the emulator |

> ⚠️ Anything prefixed `EXPO_PUBLIC_` is **embedded in the app bundle and readable by anyone
> who installs it**. No secret, key or credential belongs there — ever.

Rotating `GATE_PASS_SECRET` invalidates every pass currently in circulation, so rotate
between shifts, not during one.

---

## Troubleshooting

<details>
<summary><b>App crashes on launch: <code>Native module ... is not registered</code></b></summary>

You are running Expo Go. There is no code fix — build a development build with
`npx expo run:android`. See [`VISION.md`](VISION.md) ADR-005.
</details>

<details>
<summary><b>Gradle: <code>A restricted method in java.lang.System has been called</code></b></summary>

Gradle's daemon is pinned to JDK 22+, which enforces native-access restrictions that break
the NDK/CMake step. Look for a stray `android/gradle/gradle-daemon-jvm.properties` — it is
not part of the standard template and only appears if something ran `gradlew
updateDaemonJvm`. Delete it; Gradle falls back to `JAVA_HOME`. This project builds against
**JDK 17**.
</details>

<details>
<summary><b>Gradle: "filename, directory name, or volume label syntax is incorrect"</b></summary>

`android/local.properties` has backslashes. Use forward slashes even on Windows:
`sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`
</details>

<details>
<summary><b>App cannot reach any backend on a physical device</b></summary>

Almost always a stale IP in `.env` from a previous network. Check your current address
(`ipconfig`) against what is in the file, update it, and restart Metro with `--clear`.
Better: connect over USB, run `adb reverse`, and set the URLs to `http://localhost:<port>` —
that never goes stale. Step-by-step for every method: [`ipconfig.md`](ipconfig.md).
</details>

<details>
<summary><b>ANPR reports <code>CPUExecutionProvider</code></b></summary>

The GPU is not being used, and `onnxruntime` will not tell you. Run
`python scripts/check_gpu.py` for a diagnosis. Usually the CPU-only build is installed:

```bash
pip uninstall onnxruntime
pip install onnxruntime-gpu
```

Otherwise the CUDA/cuDNN versions do not match the `onnxruntime-gpu` build, or are not on
`PATH`.
</details>

<details>
<summary><b>"No number plate found in the frame"</b></summary>

Almost always framing, not the model. Fill the on-screen guide box with the plate — a plate
occupying a tenth of the frame is the single most common reason a read fails. If plates are
genuinely distant, raise `DETECTOR_MODEL` to the `-512-` or `-640-` variant.
</details>

<details>
<summary><b>Biometric service: weights not found at startup</b></summary>

Git LFS did not pull. Run `git lfs pull` and check the file is ~580 MB, not ~130 bytes.
</details>

<details>
<summary><b>Staff sign-in says the credentials are wrong</b></summary>

Run `npm run seed:demo-staff` in `Backend/Node_Backend`. The tabs exist before the accounts
do. If the accounts exist but the password was changed, `npm run seed:demo-staff -- --force`
resets them.
</details>

---

## Repository layout

```
VISION/
├── README.md                ← you are here: setup and run instructions
├── VISION.md                ← source of truth: identity, decisions, architecture, status
├── PRD.md                   ← requirements, FR-IDs, NFRs, KPIs
├── Design.md                ← screen specs, data model, API contract
├── progress-tracker.md      ← dated changelog
│
├── Backend/
│   ├── Node_Backend/        TypeScript · Express 5 · Firestore · :3000
│   │   └── src/core/        gate-pass signing, plate normalisation
│   │
│   ├── Biometric_Backend/   Python 3.11 · FastAPI · DeepFace · :8001
│   │   └── .deepface/weights/   VGG-Face weights, via Git LFS
│   │
│   └── ANPR_Backend/        Python 3.11 · FastAPI · ONNX Runtime · :8002
│       ├── app/core/        detection + OCR pipeline, plate post-processing
│       └── scripts/         check_gpu, benchmark, prepare_dataset, finetune_*
│
├── ReactNative_App/VISION/  TypeScript · Expo SDK 57 · :8081
│   └── src/app/
│       ├── (onboarding)/    splash, role select, sign-in, staff tabs, biometric
│       ├── (main)/          visitor / parent shell
│       ├── (faculty)/       approval inbox
│       ├── (student)/       sponsor flow
│       ├── (security)/      gate: register, plate-scan, pass, scan-exit, on-campus
│       └── (admin)/         placeholder shell
│
└── Dry_Test/                experiments and scratch work
```

---

## Documentation map

The repository once carried ~14 overlapping markdown files — the authentication flow alone
was described five times, in versions that contradicted each other. The split below is what
prevents that returning. **Each document owns its subject; none restates another's.**

| Document | Owns |
|---|---|
| **`README.md`** | Setup, prerequisites, run commands, troubleshooting |
| **[`VISION.md`](VISION.md)** | Project identity, role & auth model, decision log (ADRs), as-built architecture, current status, delivery phases |
| **[`PRD.md`](PRD.md)** | Requirements with FR-IDs, NFRs, user stories, personas, KPIs, risks |
| **[`Design.md`](Design.md)** | Screen specs, data model, API contract, RBAC matrix |
| **[`progress-tracker.md`](progress-tracker.md)** | Dated log of what changed |
| `Backend/*/\*_startup.md` | Operational runbook for that one service |
| [`ipconfig.md`](ipconfig.md) | Connecting the phone to the backends: Wi-Fi IP updates, USB, emulator, tunnels |
| [`frontend_startup.md`](ReactNative_App/VISION/frontend_startup.md) | Starting the app, and what to do after each kind of change |
| [`connection.md`](connection.md) | Installing and running the app on a OnePlus phone over USB or wireless debugging |

When adding a feature, update the existing canonical document — do not drop a fresh
`FIX_SOMETHING.md` next to the code.

---

## A note on ANPR accuracy

The pipeline runs and reads plates, but **no number has been measured against real VIT-AP
gate photographs**, so none is claimed. The order of work is fixed, and it is the opposite
of the tempting one:

1. Collect crops (`SAVE_CROPS=true`) through a shift of real traffic.
2. Label them — `python scripts/prepare_dataset.py triage`.
3. **Measure** — `python scripts/benchmark.py --images <dir> --labels <csv>`.
4. *Only then* consider fine-tuning.

The shipped models are trained across 65+ countries and are usually already good enough;
the positional confusion correction in `app/core/postprocess.py` fixes most of what remains
for free. Fine-tuning below roughly a thousand corrected samples reliably makes the model
*worse*. The benchmark's confusion table is what decides whether the detector, the
recogniser, or neither is the weak link.

---

<div align="center">

**Owner** · Saptarshi Bose — B.Tech CSE, VIT-AP University

*Delivered incrementally, feature by feature, in consultation with the client.*

</div>
