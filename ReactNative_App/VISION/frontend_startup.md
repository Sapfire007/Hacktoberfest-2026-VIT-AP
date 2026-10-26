# Frontend (React Native App) - Startup Guide

The VISION mobile app: Expo SDK 57 · React Native 0.86 · expo-router · TypeScript.

> **This app runs as a development build, never in Expo Go.** It uses native modules
> (`@react-native-firebase/*`, Google Sign-In) that Expo Go cannot load — opening it there
> fails with `Native module ... is not registered`, which has no code fix. See
> [`VISION.md`](../../VISION.md) ADR-005.

---

## Quick Start (daily)

Once the dev build is installed on your phone or emulator:

```powershell
cd E:\VISION\ReactNative_App\VISION
npx expo start --dev-client
```

Then open **VISION** on the device. Physical phone? Forward the ports first (USB or wireless
adb both work):

```powershell
adb reverse tcp:8081 tcp:8081; adb reverse tcp:3000 tcp:3000; adb reverse tcp:8001 tcp:8001; adb reverse tcp:8002 tcp:8002
```

The backends must be running too — see the [backend runbooks](#related-guides).

---

## First-Time Setup (once per machine)

```powershell
cd E:\VISION\ReactNative_App\VISION

# 1. Dependencies
npm install

# 2. Config
Copy-Item .env.example .env          # then set the backend URLs — see "Environment" below

# 3. Firebase config file — place your project's google-services.json here:
#    E:\VISION\ReactNative_App\VISION\google-services.json

# 4. Generate the native Android project (only if android\ does not exist)
npx expo prebuild --platform android

# 5. Tell Gradle where the Android SDK is — FORWARD slashes, even on Windows
Set-Content -Encoding ascii android\local.properties "sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk"

# 6. Build, install and launch on a connected phone or running emulator
npx expo run:android
```

Step 6 takes several minutes the first time. It compiles the native app, installs it, and
starts Metro for you.

| Requirement | Why |
|---|---|
| **Node 20+** | Tested on 24.14 |
| **JDK 17** | JDK 22+ breaks the NDK/CMake step — see [Troubleshooting](#troubleshooting) |
| **Android Studio + SDK** | Emulator, `adb`, and the SDK Gradle builds against |
| A phone with USB debugging, or an emulator | Connecting a OnePlus: [`connection.md`](../../connection.md) |

---

## What to Do After Making Changes

The single most useful table in this file. Find the kind of change, do what it says.

| You changed | What to do | Rebuild the APK? |
|---|---|---|
| **Screens, components, hooks, styles, API calls** (`src/**/*.ts`, `*.tsx`) | Just **save**. Fast Refresh updates the running app in 1-2 s | No |
| **`.env`** (backend URLs, any `EXPO_PUBLIC_` value) | **Restart Metro with `--clear`** — see below | No |
| **Added a JS-only package** (e.g. `react-native-qrcode-svg`) | `npx expo install <pkg>`, then restart Metro | No |
| **Added a native package** (anything with Android code, a config plugin, or "requires a development build" in its docs) | `npx expo install <pkg>`, then `npx expo run:android` | **Yes** |
| **`app.json` native settings** (plugins, permissions, package name, icons, splash) | `npx expo prebuild --platform android --clean`, recreate `local.properties`, then `npx expo run:android` | **Yes** |
| **`app.json` non-native fields** | Restart Metro | No |
| **`google-services.json`** | `npx expo run:android` | **Yes** |
| **Files inside `android\`** | Don't — see note below | — |
| **Backend code** (Node / Python) | Restart that backend only. The app needs nothing; the next API call reaches the new server | No |

### Why `.env` needs `--clear`

`EXPO_PUBLIC_` variables are **baked into the JavaScript bundle** when Metro builds it, not
read at runtime. Saving `.env` does not trigger Fast Refresh, and a normal reload serves the
old bundle with the old values. Stop Metro (`Ctrl+C`) and:

```powershell
npx expo start --dev-client --clear
```

This is the fix whenever the app keeps connecting to an old IP after you changed Wi-Fi.

### Why not to edit `android\` directly

`android\` is **generated** by `expo prebuild` and is gitignored. Any
`prebuild --clean` deletes and rebuilds it, and your edits go with it. Native configuration
belongs in `app.json` (or a config plugin), which regenerates `android\` the same way every
time.

### How to tell a package is native

If its install instructions mention a **config plugin**, **pod install**, **autolinking**, or
say it **does not work in Expo Go**, it is native and needs `npx expo run:android`. When
unsure, install it, restart Metro, and open the app: a native package missing from the build
fails immediately with `Native module ... is not registered` or `Cannot find native module`.

### Use `npx expo install`, not `npm install <pkg>`

`npx expo install` picks the version of a package that matches **SDK 57**. `npm install` takes
the latest, which is often built for a different SDK and fails at build time or runtime.

---

## Typical Development Session

**Terminal layout:**

| Terminal | Runs | Stays open |
|---|---|---|
| 1 | Node API (`:3000`) | Yes |
| 2 | Biometric service (`:8001`) | Yes |
| 3 | ANPR service (`:8002`) | Yes |
| 4 | **Metro** (`npx expo start --dev-client`) | Yes |

Commands for 1-3 are in the backend runbooks and the [README](../../README.md#running-it--every-day).

**Then:** edit → save → watch the phone update. Restart only what the table above says.

> **Don't run `npx expo start` and `npx expo run:android` at the same time.**
> `run:android` starts its own Metro on port `8081`; a second one already running makes it
> pick another port or prompt. Use `run:android` for the first build and after native changes;
> use `expo start --dev-client` the rest of the time.

### Useful Metro keys

With Metro running, press in its terminal:

| Key | Does |
|---|---|
| `r` | Reload the app |
| `j` | Open the JavaScript debugger |
| `m` | Toggle the in-app developer menu |
| `Ctrl+C` | Stop Metro |

On the phone, **shake** it to open the developer menu (Reload, Debugger, Performance monitor).

---

## Environment

`E:\VISION\ReactNative_App\VISION\.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api
EXPO_PUBLIC_BIOMETRIC_API_BASE_URL=http://localhost:8001/api/v1
EXPO_PUBLIC_ANPR_API_BASE_URL=http://localhost:8002/api/v1
```

| Device setup | Use in `.env` |
|---|---|
| Phone over USB or wireless adb, with `adb reverse` | `http://localhost:<port>` — never changes |
| Phone on Wi-Fi, no `adb reverse` | `http://<PC's IPv4>:<port>` — changes with every network |
| Android emulator | `http://10.0.2.2:<port>`, or leave unset (the default) |

Full walkthrough, including a one-line command to update the IP: [`ipconfig.md`](../../ipconfig.md).

> Everything prefixed `EXPO_PUBLIC_` is **embedded in the app and readable by anyone who
> installs it**. Never put a secret, key or credential in this file.

Other variables:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_ENABLE_DEMO_LOGIN` | `1` shows the demo staff credentials on the sign-in tabs outside a dev build |
| `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` | Only for the optional Google Sign-In button |

---

## Verify It Is Working

1. Metro prints `Android Bundled ... (2239 modules)` when the app connects.
2. The app opens to the splash / sign-in screen, not a red error screen.
3. On the phone, `http://localhost:3000/health` in Chrome shows the backend's JSON (with
   `adb reverse`), confirming the app will reach the API.
4. Sign in as Security with `VITAP-SEC01` / `VisionSecurity@2026` (seed first with
   `npm run seed:demo-staff` in `Backend\Node_Backend`).

---

## Admin Console in the Browser

The admin console is part of the app. On a phone, sign in as Admin (`VITAP-ADM01` /
`VisionAdmin@2026`). To use it on a laptop:

1. Once only: in the Firebase console, open **Project settings → Your apps**, add a **Web app**
   if there is none, and copy its config into `.env`:
   `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`,
   `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`.
2. Make sure `EXPO_PUBLIC_API_BASE_URL` points at a backend address the laptop can reach
   (`http://localhost:3000/api` when the backend runs on the same machine).
3. Start the web build (`--clear` because `.env` changed):

```powershell
cd E:\VISION\ReactNative_App\VISION
npx expo start --web --clear
```

4. Open the printed URL (usually `http://localhost:8081`), choose **Staff sign-in → Admin**, and
   sign in with the employee ID.

Report downloads open a new tab; the link is valid for five minutes.

---

## Troubleshooting

### `Native module ... is not registered`
You opened the app in **Expo Go**, or a native package was added without rebuilding. Use the
dev build, and run `npx expo run:android` after adding native packages.

### App still uses an old IP / `Failed to connect to /<old-ip>:3000`
`.env` changed but Metro was not restarted with `--clear`. The address in the error is what
the running bundle contains.

### `Unable to load script` / dev launcher shows no server
Metro is not reachable. Check it is running, then `adb reverse tcp:8081 tcp:8081` and reopen
the app.

### Gradle: `A restricted method in java.lang.System has been called`
Gradle's daemon is on JDK 22+. Delete `android\gradle\gradle-daemon-jvm.properties` if it
exists and make sure `JAVA_HOME` points to **JDK 17**.

### Gradle: "filename, directory name, or volume label syntax is incorrect"
`android\local.properties` has backslashes. Use forward slashes:
`sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`

### `SDK location not found` after `prebuild --clean`
`--clean` deleted `android\local.properties`. Recreate it (First-Time Setup, step 5), or set
the `ANDROID_HOME` environment variable once so you never have to.

### Changes are not showing up
- JS change not appearing: press `r` in Metro, or shake the phone → **Reload**.
- Still stale: `npx expo start --dev-client --clear`.
- Native change: it needs `npx expo run:android` — Fast Refresh never picks those up.

### Red error overlay in development
`console.error` calls show a red toast in dev builds. Read the message: an `API Request Error`
names the endpoint and usually means a backend is down or unreachable.

---

## Related Guides

| Guide | Covers |
|---|---|
| [`README.md`](../../README.md) | Whole-project setup and daily run commands |
| [`connection.md`](../../connection.md) | Installing on a OnePlus over USB or wireless debugging |
| [`ipconfig.md`](../../ipconfig.md) | Keeping the app pointed at the backends across networks |
| [`backend_biometric_startup.md`](../../Backend/Biometric_Backend/backend_biometric_startup.md) | Biometric service |
| [`ANPR_backend_startup.md`](../../Backend/ANPR_Backend/ANPR_backend_startup.md) | Plate recognition service |

---

**Last Updated**: September 18, 2026
