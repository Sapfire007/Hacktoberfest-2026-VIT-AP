# Connecting Your OnePlus Phone — USB & Wireless Debugging

How to install the VISION app on a OnePlus phone and run it against the backends on your PC,
over a **USB cable** or **wirelessly**.

> **Already know which method you want?** Jump to [Part 2 — USB](#part-2--usb-debugging) or
> [Part 3 — Wireless](#part-3--wireless-debugging). Both start with [Part 1](#part-1--one-time-phone-setup).

---

## Contents

- [How the pieces fit together](#how-the-pieces-fit-together)
- [Before you start](#before-you-start)
- [Part 1 — One-time phone setup](#part-1--one-time-phone-setup)
- [Part 2 — USB debugging](#part-2--usb-debugging)
- [Part 3 — Wireless debugging](#part-3--wireless-debugging)
- [Part 4 — Install and run the app](#part-4--install-and-run-the-app)
- [Part 5 — Connect the app to the backends](#part-5--connect-the-app-to-the-backends)
- [Daily routine](#daily-routine)
- [Troubleshooting](#troubleshooting)
- [Command reference](#command-reference)

---

## How the pieces fit together

Three separate connections have to work, and it helps to know which is which when
something fails:

```
            ┌──────────────────── your PC ────────────────────┐
            │                                                  │
  Phone ────┼──(1) adb ──────────── installs the APK,           │
            │                        forwards ports             │
            │                                                  │
  App  ─────┼──(2) Metro :8081 ──── serves the JavaScript code  │
            │                                                  │
  App  ─────┼──(3) Backends ─────── :3000 Node API             │
            │                        :8001 Biometric            │
            │                        :8002 ANPR                 │
            └──────────────────────────────────────────────────┘
```

| Connection | What breaks when it fails |
|---|---|
| **(1) adb** | `adb devices` shows nothing; the app cannot be installed |
| **(2) Metro** | App opens to a red "Unable to load script" or a dev-client launcher with no server |
| **(3) Backends** | App loads, but sign-in shows `Failed to connect to ...` |

USB and wireless debugging only change **how (1) is made**. Once adb is connected, the rest is
identical.

### Which method?

| | USB | Wireless |
|---|---|---|
| Setup each session | Plug in | Pair once, then `adb connect` |
| Reliability | Very stable | Drops if Wi-Fi changes or phone sleeps |
| Speed of installing an APK | Fast | Slower |
| Phone on mobile data? | Works | **No** — phone and PC must share Wi-Fi |
| Charges the phone | Yes | No |
| Best for | Everyday development | Testing the camera / gate flow while walking around |

---

## Before you start

**On the PC:**

| Needed | Check |
|---|---|
| Android SDK platform-tools (`adb`) | `adb version` |
| The dev build APK | `ReactNative_App\VISION\android\app\build\outputs\apk\debug\app-debug.apk` |
| The three backends running | See [README.md → Running it — every day](README.md#running-it--every-day) |

`adb` ships with Android Studio at `C:\Users\<you>\AppData\Local\Android\Sdk\platform-tools\`.
If `adb version` says "not recognized", add that folder to your `PATH` and open a new terminal.

**On the phone:** a OnePlus running Android 11 or newer (OxygenOS 11+). Wireless debugging
needs Android 11 or newer; USB works on any version.

> **Why not Expo Go?** This app uses native modules Expo Go cannot load. It must run as the
> **development build** — the `app-debug.apk` above. See [VISION.md](VISION.md) ADR-005.

---

## Part 1 — One-time phone setup

### Step 1 — Unlock Developer options

1. Open **Settings → About device**.
2. Tap **Version** (on some OxygenOS versions it is directly on the About device screen).
3. Tap **Build number** **7 times**.
4. Enter your PIN when asked. You will see *"You are now a developer!"*

> The exact path varies slightly between OxygenOS versions. If you cannot find it, search the
> Settings app for **"Build number"**.

### Step 2 — Open Developer options

**Settings → Additional settings → Developer options**

(or search Settings for **"Developer options"**).

### Step 3 — OnePlus-specific settings worth changing

These prevent the most common OnePlus-specific problems. In **Developer options**:

| Setting | Set to | Why |
|---|---|---|
| **Stay awake** | On | Screen stays on while charging — the camera screens and Metro reloads behave better |
| **Disable permission monitoring** | On (if present) | Some OxygenOS builds block apps installed over adb from getting permissions like the camera |
| **Default USB configuration** | File transfer | USB debugging on OnePlus often only works in File transfer mode, not "Charging only" |

And outside Developer options:

**Settings → Battery → Battery optimisation → VISION → Don't optimise**

OxygenOS kills background apps aggressively. Without this, the app can be killed while you
switch to the camera, and wireless debugging can drop when the screen turns off. (You can do
this after the app is installed.)

---

## Part 2 — USB debugging

### Step 1 — Enable USB debugging

**Developer options → USB debugging → On** → confirm **OK**.

### Step 2 — Connect the cable

1. Plug the phone into the PC with a **data cable**. Many cables are charge-only and will
   never show up in adb — if nothing happens, try another cable first.
2. Pull down the notification shade, tap the **USB** notification, choose **File transfer**.

### Step 3 — Authorise the PC

The phone shows **"Allow USB debugging?"** with the PC's RSA fingerprint.

1. Tick **Always allow from this computer**.
2. Tap **Allow**.

> No prompt? Unplug and replug the cable, or toggle USB debugging off and on. If it still does
> not appear: **Developer options → Revoke USB debugging authorisations**, then reconnect.

### Step 4 — Confirm adb sees the phone

```powershell
adb devices
```

Expected:

```
List of devices attached
a1b2c3d4        device
```

| Status | Meaning | Fix |
|---|---|---|
| `device` | ✅ Connected and authorised | Go to [Part 4](#part-4--install-and-run-the-app) |
| `unauthorized` | Prompt not accepted | Accept "Allow USB debugging?" on the phone |
| `offline` | Connection stuck | `adb kill-server` then `adb devices` |
| *(empty)* | Not detected | Different cable / port, set USB mode to File transfer |

✅ USB is done. Continue to [Part 4](#part-4--install-and-run-the-app).

---

## Part 3 — Wireless debugging

**Requirement:** the phone and the PC must be on the **same Wi-Fi network**. College or public
Wi-Fi often blocks device-to-device traffic — if pairing times out, see
[Troubleshooting](#wireless-pairing-times-out).

Wireless debugging has two parts, each with **its own port number**:

| Part | When | Port |
|---|---|---|
| **Pairing** | **Once** per PC | Shown in the "Pair with pairing code" popup — changes every time |
| **Connecting** | Every session | Shown on the main Wireless debugging screen — changes when toggled |

Mixing up these two ports is the most common mistake.

### Step 1 — Turn on Wireless debugging

**Developer options → Wireless debugging → On** → tick **Always allow on this network** → **Allow**.

Tap the words **Wireless debugging** (not just the toggle) to open its screen. You will see:

```
Device name          OnePlus 11
IP address & Port    10.203.39.52:37215     <-- CONNECT port (Step 3)
```

### Step 2 — Pair (first time only)

1. On the phone, tap **Pair device with pairing code**. A popup shows:

   ```
   Wi-Fi pairing code
   482915

   IP address & Port
   10.203.39.52:41733       <-- PAIRING port (different from the one above)
   ```

2. **Keep that popup open** — closing it cancels pairing. On the PC:

   ```powershell
   adb pair 10.203.39.52:41733
   ```

3. When asked, type the 6-digit code:

   ```
   Enter pairing code: 482915
   Successfully paired to 10.203.39.52:41733 [guid=adb-XXXX]
   ```

The phone now lists your PC under **Paired devices**. You do not need to pair again unless you
remove it or reset the phone.

### Step 3 — Connect

Use the **main screen's** IP and port — not the pairing one:

```powershell
adb connect 10.203.39.52:37215
```

```
connected to 10.203.39.52:37215
```

### Step 4 — Confirm

```powershell
adb devices
```

```
List of devices attached
10.203.39.52:37215      device
```

✅ Wireless is done. Continue to [Part 4](#part-4--install-and-run-the-app).

> **Plugged in the cable as well?** Then `adb devices` lists the phone twice, and every command
> fails with `more than one device/emulator`. Unplug the cable, or add `-s <id>` to each command:
> `adb -s 10.203.39.52:37215 reverse tcp:3000 tcp:3000`.

### Reconnecting next time

The connect port changes whenever Wireless debugging is toggled or the phone reboots. Each
session:

1. **Developer options → Wireless debugging → On**
2. Read the current **IP address & Port** on that screen
3. `adb connect <ip>:<port>`

No pairing needed.

---

## Part 4 — Install and run the app

Adb is connected — by cable or wirelessly, it makes no difference from here.

### Option A — Install the existing APK (fast, no rebuild)

Use this when the dev build is already built and no native dependency has changed.

```powershell
cd E:\VISION\ReactNative_App\VISION
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

`-r` replaces an existing install and keeps its data. Expected output ends with `Success`.

### Option B — Build and install in one step

Use this the first time, or whenever a native package was added or changed.

```powershell
cd E:\VISION\ReactNative_App\VISION
npx expo run:android --device
```

`--device` lists connected devices so you can pick the OnePlus. This compiles the APK (several
minutes the first time), installs it, and starts Metro.

> **OnePlus: "Install via USB" prompt.** Some OxygenOS versions ask for confirmation on the
> phone during `adb install`. Watch the phone screen and tap **Install** — if you miss it, the
> install fails with `INSTALL_FAILED_USER_RESTRICTED`.

### Start Metro

If you used Option A, start Metro yourself:

```powershell
cd E:\VISION\ReactNative_App\VISION
npx expo start --dev-client --clear
```

### Point the app at Metro

Forward Metro's port so the app finds it — **works for both USB and wireless adb**:

```powershell
adb reverse tcp:8081 tcp:8081
```

Open **VISION** on the phone. The development client either loads the app directly, or shows a
launcher — tap the server listed as `http://localhost:8081`.

> **No `adb reverse`?** In the dev launcher, choose **Enter URL manually** and type
> `http://<PC-IP>:8081`, with phone and PC on the same Wi-Fi.

---

## Part 5 — Connect the app to the backends

The app loads, but sign-in needs the backends on ports `3000`, `8001` and `8002`. Pick one:

### Recommended — `adb reverse` (never needs an IP)

This works over **both USB and wireless** adb:

```powershell
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8001 tcp:8001
adb reverse tcp:8002 tcp:8002
```

And set `ReactNative_App\VISION\.env` to:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api
EXPO_PUBLIC_BIOMETRIC_API_BASE_URL=http://localhost:8001/api/v1
EXPO_PUBLIC_ANPR_API_BASE_URL=http://localhost:8002/api/v1
```

Restart Metro with `--clear` after changing `.env` — the addresses are baked into the bundle.

Check it: open `http://localhost:3000/health` in the phone's Chrome. You should see JSON.

> **Forwards are removed** whenever adb disconnects — unplugging, Wi-Fi dropping, rebooting.
> Re-run all four `adb reverse` commands (8081 plus the three backends) after reconnecting.

### Alternative — your PC's Wi-Fi IP

Put the PC's LAN IP in `.env` instead. It needs no `adb reverse`, but must be updated every
time you change networks. Full steps: **[ipconfig.md](ipconfig.md)**.

---

## Daily routine

### With USB

```powershell
# 1. Plug in the phone, then:
adb devices

# 2. Forward Metro and the backends
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8001 tcp:8001
adb reverse tcp:8002 tcp:8002

# 3. Start Metro
cd E:\VISION\ReactNative_App\VISION
npx expo start --dev-client

# 4. Open VISION on the phone
```

### With wireless

```powershell
# 1. Phone: Developer options → Wireless debugging → On → read IP:port
adb connect <ip>:<port>
adb devices

# 2-4. Same as USB above
```

Start the backends first either way — see [README.md](README.md#running-it--every-day).

---

## Troubleshooting

### `adb devices` is empty (USB)

1. Try a different cable — charge-only cables are the most common cause.
2. Notification shade → USB → **File transfer**.
3. Try another USB port on the PC, directly rather than through a hub.
4. `adb kill-server` then `adb devices`.
5. Toggle **USB debugging** off and on.

### `unauthorized`

The "Allow USB debugging?" prompt was dismissed. Unplug and replug to see it again. If it never
reappears: **Developer options → Revoke USB debugging authorisations**, then reconnect.

### Wireless pairing times out

- Phone and PC on the **same** Wi-Fi? Check both.
- Keep the **pairing code popup open** while running `adb pair`.
- You used the **pairing** port for `adb pair`, not the connect port.
- **College or public Wi-Fi** often isolates devices from each other. No PC setting fixes that —
  use USB, or turn on the phone's hotspot, connect the PC to it, and pair again.
- Windows Firewall may block adb. Allow `adb.exe` on Private networks when prompted.

### `failed to connect to <ip>:<port>`

- Wireless debugging was toggled or the phone rebooted, so the **port changed**. Read the new
  one from the Wireless debugging screen.
- The phone's screen went off and OxygenOS paused Wi-Fi. Turn on **Stay awake** and plug in a
  charger.

### Wireless connection keeps dropping

OxygenOS saves battery aggressively. **Developer options → Stay awake** (while charging), and
**Settings → Battery → Battery optimisation → VISION → Don't optimise**. For a long session, USB
is more reliable.

### `more than one device/emulator`

The phone is listed twice (USB + wireless), or an emulator is running. Disconnect one, or add
`-s <device-id>` to adb commands. Get the IDs from `adb devices`.

### `INSTALL_FAILED_UPDATE_INCOMPATIBLE`

A VISION build signed with a different key is already installed. Uninstall it and retry:

```powershell
adb uninstall com.vision.app
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

This deletes the app's local data on the phone.

### `INSTALL_FAILED_USER_RESTRICTED`

OxygenOS asked for confirmation on the phone and it was not given in time. Run the install
again and tap **Install** on the phone.

### App opens but shows "Unable to load script" / no development server

Metro is not reachable. Check Metro is running, then `adb reverse tcp:8081 tcp:8081`, and
reopen the app.

### App loads, but sign-in says `Failed to connect to ...`

A backend is unreachable. The address in the error shows what the app tried:

- `localhost` → re-run the three backend `adb reverse` commands.
- An IP → it may be stale. See [ipconfig.md](ipconfig.md).
- Either → check the backends are running.

### Camera shows black / permission never asked

**Settings → Apps → VISION → Permissions → Camera → Allow**. On some OxygenOS builds also turn on
**Developer options → Disable permission monitoring** and reinstall.

---

## Command reference

| Task | Command |
|---|---|
| List connected devices | `adb devices` |
| Restart adb | `adb kill-server` then `adb devices` |
| Pair wirelessly (once) | `adb pair <ip>:<pairing-port>` |
| Connect wirelessly | `adb connect <ip>:<connect-port>` |
| Disconnect wireless | `adb disconnect <ip>:<port>` |
| Install / update the APK | `adb install -r android\app\build\outputs\apk\debug\app-debug.apk` |
| Build and install | `npx expo run:android --device` |
| Uninstall | `adb uninstall com.vision.app` |
| Forward Metro | `adb reverse tcp:8081 tcp:8081` |
| Forward backends | `adb reverse tcp:3000 tcp:3000` (and `8001`, `8002`) |
| Show forwards | `adb reverse --list` |
| Remove all forwards | `adb reverse --remove-all` |
| Start Metro | `npx expo start --dev-client --clear` |
| Live app logs | `adb logcat *:S ReactNativeJS:V` |
| Target one device | add `-s <device-id>` to any adb command |
