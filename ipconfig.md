# Connecting the Phone to the Backends — IP Configuration Guide

The app on your phone has to reach the three backends running on your PC. How it finds
them depends on how the phone is connected, and the most common reason for errors like this
one is an out-of-date IP address:

```
fetch failed: java.net.ConnectException: Failed to connect to /10.85.236.146:3000
```

This guide explains why that happens, how to fix it in a minute, and how to set things up so
it stops happening.

---

## Contents

1. [Why the IP address matters](#1-why-the-ip-address-matters)
2. [Which connection method should I use?](#2-which-connection-method-should-i-use)
3. [Method A — Wi-Fi: update the IP after changing networks](#3-method-a--wi-fi-update-the-ip-after-changing-networks)
4. [Method B — USB with adb reverse (recommended)](#4-method-b--usb-with-adb-reverse-recommended)
5. [Method C — Android emulator](#5-method-c--android-emulator)
6. [Method D — Tunnel, for mobile data and remote demos](#6-method-d--tunnel-for-mobile-data-and-remote-demos)
7. [Method E — Deployed backends (the long-term answer)](#7-method-e--deployed-backends-the-long-term-answer)
8. [Troubleshooting checklist](#8-troubleshooting-checklist)
9. [Quick reference](#9-quick-reference)

---

## 1. Why the IP address matters

The backends run on your PC:

| Service | Port | Used for |
|---|---|---|
| Node API | `3000` | Sign-in, gate entries, QR passes — everything |
| Biometric | `8001` | Face enrolment and verification |
| ANPR | `8002` | Number plate reading |

The app finds them through three lines in `ReactNative_App/VISION/.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.203.39.13:3000/api
EXPO_PUBLIC_BIOMETRIC_API_BASE_URL=http://10.203.39.13:8001/api/v1
EXPO_PUBLIC_ANPR_API_BASE_URL=http://10.203.39.13:8002/api/v1
```

`10.203.39.13` is **your PC's address on the current Wi-Fi network**. The router hands that
address out, and a different network hands out a different one. Your home Wi-Fi, the
college Wi-Fi and a phone hotspot each give the PC a new address, and the old one in `.env`
now points at nothing.

### What about mobile data?

If the **phone** switches to mobile data, Wi-Fi IPs cannot work at all, whatever you put in
`.env`. The backends are on your PC's local network; the phone on mobile data is out on the
internet and cannot see inside that network. You need USB (Method B), a tunnel (Method D) or
deployed backends (Method E).

### Why a normal reload does not pick up changes

Anything starting with `EXPO_PUBLIC_` is **baked into the JavaScript bundle when Metro builds
it**. Editing `.env` and shaking the phone to reload serves the old bundle with the old
address. You must restart Metro with `--clear` after every `.env` change.

---

## 2. Which connection method should I use?

| Method | Does the IP ever need updating? | Works on mobile data? | Setup effort | Best for |
|---|---|---|---|---|
| **A. Wi-Fi + LAN IP** | Yes, every network change | No | Low | Quick wireless testing |
| **B. USB + `adb reverse`** | **Never** | **Yes** | Low | **Everyday testing on your phone** |
| **C. Emulator** | Never | — | None | Testing without a phone |
| **D. Tunnel (ngrok / Cloudflare)** | Fixed URL per session | Yes | Medium | Demos to someone elsewhere |
| **E. Deployed backend** | Never | Yes | High | The real app |

**Recommendation:** use **B (USB)** day to day. Use **A** only when you need to test without
a cable, and follow Section 3 every time you change networks.

---

## 3. Method A — Wi-Fi: update the IP after changing networks

Follow these steps **every time your PC joins a different network**.

Requirements: the phone and PC must be on the **same Wi-Fi network**.

### Step 1 — Find your PC's new IP address

Open PowerShell:

```powershell
ipconfig
```

Find the adapter you are connected through — usually **"Wireless LAN adapter Wi-Fi"** — and
read the **IPv4 Address** line:

```
Wireless LAN adapter Wi-Fi:

   Connection-specific DNS Suffix  . :
   IPv4 Address. . . . . . . . . . . : 10.203.39.13      <-- this one
   Subnet Mask . . . . . . . . . . . : 255.255.0.0
   Default Gateway . . . . . . . . . : 10.203.0.1
```

Ignore these, they are not the address you want:

| Adapter / address | Why not |
|---|---|
| `127.0.0.1` | Loopback — only means "this PC" to the PC itself |
| `169.254.x.x` | The adapter has no working network |
| `vEthernet (WSL)`, `VirtualBox`, `VMware` | Virtual adapters the phone cannot reach |
| `Ethernet` with no cable plugged in | Not connected |

Or get just the Wi-Fi address in one line:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi').IPAddress
```

> If that command errors, your adapter has a different name (for example `Wi-Fi 2`). Run
> `Get-NetIPAddress -AddressFamily IPv4 | Select InterfaceAlias,IPAddress` to see the names.

### Step 2 — Update the three URLs in the app's `.env`

**Option 1: edit by hand.** Open `E:\VISION\ReactNative_App\VISION\.env` and replace the old
address in all three lines:

```env
EXPO_PUBLIC_API_BASE_URL=http://<NEW_IP>:3000/api
EXPO_PUBLIC_BIOMETRIC_API_BASE_URL=http://<NEW_IP>:8001/api/v1
EXPO_PUBLIC_ANPR_API_BASE_URL=http://<NEW_IP>:8002/api/v1
```

Keep the ports (`3000`, `8001`, `8002`) and the paths (`/api`, `/api/v1`) exactly as they are.
Only the address changes.

**Option 2: update automatically with one PowerShell command.** This reads the current Wi-Fi
address and rewrites all three URLs:

```powershell
cd E:\VISION\ReactNative_App\VISION
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi').IPAddress
$content = (Get-Content .env) -replace 'http://[^:/]+:(3000|8001|8002)', "http://${ip}:`$1"
[IO.File]::WriteAllLines("$PWD\.env", $content)
Select-String -Path .env -Pattern 'BASE_URL'
```

The last line prints the three URLs so you can confirm the change.

> `WriteAllLines` is used instead of `Set-Content` on purpose: Windows PowerShell 5.1's
> `Set-Content -Encoding utf8` adds an invisible byte-order mark at the start of the file,
> which can stop the first variable being read.

### Step 3 — Make sure the backends are running

The IP change does not affect the backends themselves — they listen on every network
interface (`0.0.0.0`), so they need no changes and no restart. Check they are up:

```powershell
Get-NetTCPConnection -LocalPort 3000,8001,8002 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort
```

You should see all three ports. If one is missing, start it — see
[README.md → Running it — every day](README.md#running-it--every-day).

### Step 4 — Test from the phone's browser first

Before touching the app, open the phone's browser (Chrome) and visit:

```
http://<NEW_IP>:3000/health
```

| What you see | Meaning | Next |
|---|---|---|
| JSON with `"VISION Backend is running"` | Phone can reach the PC | Go to Step 5 |
| Page never loads / times out | Blocked or wrong network | See [Section 8](#8-troubleshooting-checklist) — usually the firewall |

Checking in the browser separates network problems from app problems. If the browser cannot
reach the backend, nothing in the app will.

You can check the other two the same way:
`http://<NEW_IP>:8001/api/v1/health` and `http://<NEW_IP>:8002/api/v1/health`.

### Step 5 — Restart Metro with a cache clear

Stop the running Metro terminal with `Ctrl+C`, then:

```powershell
cd E:\VISION\ReactNative_App\VISION
npx expo start --dev-client --clear
```

`--clear` is **required** — without it the old address stays in the bundle (see Section 1).

### Step 6 — Reload the app and sign in

Close and reopen the app (or shake → Reload), then sign in again.

---

## 4. Method B — USB with `adb reverse` (recommended)

**Set this up once and IP addresses stop mattering.** It works on any Wi-Fi, on mobile data,
and with no network at all.

### How it works

`adb reverse` creates a tunnel over the USB cable. When the app asks for
`localhost:3000` **on the phone**, adb forwards it to port `3000` **on your PC**. Because the
app talks to `localhost`, your PC's network address is never involved.

### Step 1 — Enable USB debugging (once)

On the phone: **Settings → About phone → tap "Build number" 7 times** to unlock Developer
options, then **Settings → Developer options → USB debugging → On**.

### Step 2 — Connect and confirm

Plug in the phone, accept the "Allow USB debugging?" prompt on its screen, then:

```powershell
adb devices
```

You should see a line ending in `device`. If it says `unauthorized`, accept the prompt on the
phone. If nothing is listed, try another cable — many cables are charge-only.

### Step 3 — Forward the three ports

```powershell
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8001 tcp:8001
adb reverse tcp:8002 tcp:8002
```

Confirm:

```powershell
adb reverse --list
```

> **Repeat this step every time you reconnect the cable or restart the phone.** The forwards
> are removed when the USB connection drops. This is the only recurring step for this method.

### Step 4 — Point `.env` at localhost (once)

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api
EXPO_PUBLIC_BIOMETRIC_API_BASE_URL=http://localhost:8001/api/v1
EXPO_PUBLIC_ANPR_API_BASE_URL=http://localhost:8002/api/v1
```

### Step 5 — Restart Metro with a cache clear (once, after the `.env` change)

```powershell
cd E:\VISION\ReactNative_App\VISION
npx expo start --dev-client --clear
```

### Step 6 — Test

In the phone's browser, `http://localhost:3000/health` should now show the backend's JSON.
Then reload the app and sign in.

From now on, changing Wi-Fi or switching the phone to mobile data needs **no changes** — just
re-run Step 3 if the cable was unplugged.

---

## 5. Method C — Android emulator

The emulator has a fixed alias for the PC: **`10.0.2.2`**. It never changes.

`src/config/backend.ts` already uses `10.0.2.2` when the URLs are not set. For the emulator,
either delete or comment out the three `BASE_URL` lines in `.env`, or set them explicitly:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000/api
EXPO_PUBLIC_BIOMETRIC_API_BASE_URL=http://10.0.2.2:8001/api/v1
EXPO_PUBLIC_ANPR_API_BASE_URL=http://10.0.2.2:8002/api/v1
```

Then restart Metro with `--clear`.

> Note that `10.0.2.2` only works inside the emulator. A physical phone given this address
> will fail to connect.

---

## 6. Method D — Tunnel, for mobile data and remote demos

A tunnel gives a backend on your PC a **public internet address**, so the phone can reach it
from anywhere — mobile data, another city, someone else's phone.

### Using ngrok

1. Create a free account at <https://ngrok.com>, download ngrok, and add your auth token:

   ```powershell
   ngrok config add-authtoken <YOUR_TOKEN>
   ```

2. Tunnel the Node API (the one needed for sign-in):

   ```powershell
   ngrok http 3000
   ```

3. ngrok prints a forwarding address, for example:

   ```
   Forwarding  https://a1b2-c3d4.ngrok-free.app -> http://localhost:3000
   ```

4. Put it in `.env` (note `https`, and no port number):

   ```env
   EXPO_PUBLIC_API_BASE_URL=https://a1b2-c3d4.ngrok-free.app/api
   ```

5. Restart Metro with `--clear`.

**Things to know about tunnels:**

- **Each backend needs its own tunnel.** Tunnel `8001` and `8002` in separate terminals if
  you need biometrics or plate reading too. The free plan limits how many run at once.
- **Free URLs change every time ngrok restarts**, so you update `.env` then — the same chore
  as a Wi-Fi IP, just less often.
- **Anyone with the URL can reach your backend** while the tunnel is running. Stop it with
  `Ctrl+C` when the demo is over.
- Plate reading uploads several photos per scan, so it will feel slower over a tunnel than on
  local Wi-Fi.

Cloudflare Tunnel (`cloudflared`) works the same way and can be given a permanent address.

---

## 7. Method E — Deployed backends (the long-term answer)

Once the backends run on a server with a domain name, the app points at that address
permanently:

```env
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example/api
EXPO_PUBLIC_BIOMETRIC_API_BASE_URL=https://bio.your-domain.example/api/v1
EXPO_PUBLIC_ANPR_API_BASE_URL=https://anpr.your-domain.example/api/v1
```

It then works on any Wi-Fi and on mobile data, with no updates when networks change. This is
what the finished app will use. For the ANPR server, install `requirements.txt` and keep
`DEVICE=auto` — see [ANPR_backend_startup.md](Backend/ANPR_Backend/ANPR_backend_startup.md).

---

## 8. Troubleshooting checklist

Work through these in order when the app cannot connect.

| # | Check | How |
|---|---|---|
| 1 | Are the backends running? | `Get-NetTCPConnection -LocalPort 3000,8001,8002 -State Listen` |
| 2 | Is the IP in `.env` current? | Compare `ipconfig` with the `BASE_URL` lines in `.env` |
| 3 | Did you restart Metro with `--clear`? | Old addresses stay in the bundle otherwise |
| 4 | Are phone and PC on the same Wi-Fi? | Wi-Fi method only. Mobile data never works with a LAN IP |
| 5 | Can the phone's browser open `/health`? | `http://<IP>:3000/health` |
| 6 | Is Windows Firewall blocking it? | See below |
| 7 | Does the network isolate devices? | See below |
| 8 | Did the USB forwards drop? | `adb reverse --list` — re-run the three `adb reverse` commands |

### Windows Firewall

When Node or Python first listens on a port, Windows asks whether to allow it. If you clicked
Cancel, or the network is marked **Public**, other devices are blocked.

**Check the network profile:** Settings → Network & internet → Wi-Fi → your network → set
**Network profile type** to **Private** for networks you trust, like home Wi-Fi.

**Or add rules for the three ports.** Run PowerShell **as Administrator**:

```powershell
New-NetFirewallRule -DisplayName "VISION backends" -Direction Inbound -Protocol TCP -LocalPort 3000,8001,8002 -Action Allow -Profile Private
```

Only add this rule for Private networks, not Public ones. To remove it later:

```powershell
Remove-NetFirewallRule -DisplayName "VISION backends"
```

### College or public Wi-Fi blocks device-to-device traffic

Many campus, office and café networks use **client isolation**: devices can reach the
internet but not each other. The phone's browser test (step 5) times out even with the right
IP and firewall rules. No setting on your PC fixes this. Use **USB (Method B)**, or turn on
the phone's hotspot and connect the PC to it (then follow Section 3 — the PC gets a new
address on the hotspot).

### The error message tells you which address the app used

```
Failed to connect to /10.85.236.146:3000
```

The address after `to /` is what is baked into the running bundle. If it is not your current
IP, the `.env` was not updated or Metro was not restarted with `--clear`.

---

## 9. Quick reference

### Changed Wi-Fi network (Method A)

```powershell
# 1. New IP
ipconfig

# 2. Update .env automatically
cd E:\VISION\ReactNative_App\VISION
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi').IPAddress
$content = (Get-Content .env) -replace 'http://[^:/]+:(3000|8001|8002)', "http://${ip}:`$1"
[IO.File]::WriteAllLines("$PWD\.env", $content)

# 3. Test in the phone's browser:  http://<IP>:3000/health

# 4. Restart Metro
npx expo start --dev-client --clear
```

### USB (Method B) — each time you plug in

```powershell
adb devices
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8001 tcp:8001
adb reverse tcp:8002 tcp:8002
```

### Which `.env` address to use

| Setup | Address in `.env` |
|---|---|
| Phone on Wi-Fi | `http://<PC's IPv4>:<port>` — update on every network change |
| Phone on USB | `http://localhost:<port>` — never changes |
| Emulator | `http://10.0.2.2:<port>` — never changes |
| Tunnel | `https://<tunnel-url>` — no port |
| Deployed | `https://<your-domain>` — never changes |
