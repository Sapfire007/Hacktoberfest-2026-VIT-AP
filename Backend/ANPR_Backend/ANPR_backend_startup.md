# ANPR Backend Server - Startup Guide

Automatic Number Plate Recognition for the campus gate. Reads a vehicle's number plate from
a camera frame and returns a string; the security officer accepts or corrects it.

> **This service is optional to run.** Only the security gate's plate-scan screen calls it.
> Every other screen in the app works with it stopped, and the number plate field stays
> typeable — the scanner simply reports that the reader did not respond.

---

## Quick Start (Windows PowerShell)

### Method 1: Single Command (Recommended)
```powershell
cd E:\VISION\Backend\ANPR_Backend; .\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
```

### Method 2: Step by Step
```powershell
# 1. Navigate to the ANPR Backend directory
cd E:\VISION\Backend\ANPR_Backend

# 2. Activate the Python 3.11 virtual environment
.\venv\Scripts\activate

# 3. Start the server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
```

The models load at startup, not on the first request. Expect a few seconds of silence after
`Started server process` before `Application startup complete` — that is deliberate, so a
gate officer is never the one waiting for a model to load while a car sits at the barrier.

---

## First-Time Setup (once per machine)

The virtual environment is **not** committed. Create it before the first run.

```powershell
# 1. Create a Python 3.11 environment
cd E:\VISION\Backend\ANPR_Backend
python -m venv venv
# (`python` is 3.11.9 on this machine. The `py` launcher is NOT installed here, so
#  `py -3.11 -m venv` will fail with "term 'py' is not recognized".)

# 2. Activate it
.\venv\Scripts\activate

# 3. Install dependencies (~2 GB with the CUDA runtime — give it time)
pip install -r requirements.txt

# 4. Create the local config
Copy-Item .env.example .env

# 5. VERIFY THE GPU IS ACTUALLY BEING USED — do not skip this
python scripts\check_gpu.py
```

Step 5 also downloads and caches the detector and OCR models on its first run, so it takes
a minute. Point it at a real photo to see an actual read:

```powershell
python scripts\check_gpu.py C:\path\to\a\car\photo.jpg
```

### Running without a GPU

Nothing to change. The standard setup — `requirements.txt` with `DEVICE=auto` (the
default in `.env.example`) — works on every machine: it uses the GPU when CUDA is
available and falls back to the CPU when it is not. The startup log's `provider=` line
tells you which one it picked.

Same endpoints, same accuracy either way; only latency differs (tens of milliseconds per
frame on a GPU, a few hundred on a CPU).

**Optional:** on a machine that will never have a GPU, `pip install -r requirements-cpu.txt`
gives a ~1.5 GB smaller install with identical behaviour. Keep `DEVICE=auto`.

### Why step 5 matters

`onnxruntime` **does not raise an error** when it cannot load CUDA. It prints a warning,
silently falls back to the CPU, and everything keeps working about fifteen times slower.
A gate that has quietly become slow looks exactly like a gate that is working, so nobody
investigates it.

`check_gpu.py` breaks that silence. It creates a real CUDA session and reports which
execution provider it actually got, rather than which ones the build claims to support.

---

## Virtual Environments in this Project

Each Python service has its **own** environment. This is not tidiness — it is required.

| Environment | Python | Service | Stack |
|---|---|---|---|
| `Biometric_Backend\venv_deepface` | 3.11 | Face recognition, port 8001 | DeepFace, TensorFlow, tf-keras, OpenCV |
| `ANPR_Backend\venv` | 3.11 | Plate recognition, port 8002 | fast-alpr, fast-plate-ocr, onnxruntime-gpu, OpenCV |

**Do not install ANPR into `venv_deepface`.** TensorFlow pins particular CUDA and cuDNN
versions; `onnxruntime-gpu` pins different ones. Installed side by side, whichever loads
second does not fail — it falls back to the CPU without saying so. Separate environments
make that conflict impossible rather than intermittent. See `VISION.md` ADR-006.

---

## Server Information

| Setting | Value |
|---|---|
| **Host** | `0.0.0.0` (all network interfaces) |
| **Port** | `8002` |
| **URL (Local)** | http://localhost:8002 |
| **API Base** | http://localhost:8002/api/v1 |
| **Swagger UI** | http://localhost:8002/docs |
| **Health** | http://localhost:8002/api/v1/health |
| **Readiness** | http://localhost:8002/api/v1/ready |
| **Model cache** | `%USERPROFILE%\.cache\` — downloaded once by `fast-alpr` on first load |
| **Auto-reload** | Enabled (for development) |

### The two models

| Role | Default | Where to change it |
|---|---|---|
| Plate **detector** | `yolo-v9-t-384-license-plate-end2end` | `DETECTOR_MODEL` in `.env` |
| Character **recogniser** | `cct-s-v2-global-model` | `OCR_MODEL` in `.env` |

Both are MIT-licensed ONNX models, downloaded automatically. Neither is in the repository.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Is the process up, and are the models loaded |
| `GET` | `/api/v1/ready` | Loads the models if they are not loaded, then reports. Call this to warm a freshly restarted service |
| `POST` | `/api/v1/anpr/read-base64` | One image as base64 JSON → every plate found in it. **Used by the app** |
| `POST` | `/api/v1/anpr/read` | One image as a file upload → every plate found in it. For Swagger / curl |
| `POST` | `/api/v1/anpr/read-frames` | 2-8 file uploads of the **same** vehicle → one majority-voted plate |

**Why the app uses base64 JSON:** Expo SDK 57's `fetch` cannot send React Native's
`{ uri, name, type }` file parts — it fails with `Unsupported FormDataPart implementation`.
A JSON body works with any client.

`/read-frames` is for fixed gate cameras, where extra frames cost nothing and voting across
them smooths out motion blur and glare. In Swagger, click **Add item** to attach each
frame; each one gets its own file picker.

---

## Verify the Server is Running

### 1. Check console output

```
INFO:     Started server process [xxxxx]
2026-09-16 ... | INFO | anpr_backend | Starting VISION ANPR Backend
2026-09-16 ... | INFO | anpr_backend | Detector: yolo-v9-t-384-license-plate-end2end | OCR: cct-s-v2-global-model
2026-09-16 ... | INFO | anpr_backend.pipeline | ANPR models loaded in 3.41s | ... | provider=CUDAExecutionProvider
2026-09-16 ... | INFO | anpr_backend | Models ready on CUDAExecutionProvider
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8002 (Press CTRL+C to quit)
```

**Read the `provider` line every time you start it.** `CUDAExecutionProvider` is the RTX
4060. `CPUExecutionProvider` means the GPU is not being used and reads will take hundreds
of milliseconds instead of tens.

### 2. Test the health endpoint

```powershell
Invoke-RestMethod -Uri "http://localhost:8002/api/v1/health" | ConvertTo-Json
```

Expected response:

```json
{
  "status": "ok",
  "service": "VISION ANPR Backend",
  "version": "1.0.0",
  "models_loaded": true,
  "provider": "CUDAExecutionProvider",
  "detector_model": "yolo-v9-t-384-license-plate-end2end",
  "ocr_model": "cct-s-v2-global-model"
}
```

### 3. Read a real plate without touching the app

Open http://localhost:8002/docs, expand `POST /api/v1/anpr/read`, click **Try it out**,
upload a photo of a car, and execute. Or from PowerShell:

```powershell
curl.exe -X POST "http://localhost:8002/api/v1/anpr/read" -F "image=@C:\path\to\car.jpg"
```

A successful read looks like this — note that it reports far more than a string, because an
officer needs to know how much to trust it:

```json
{
  "success": true,
  "best": {
    "plate": "AP31AB1234",
    "display": "AP 31 AB 1234",
    "raw": "AP3IAB1234",
    "confidence": 0.94,
    "detection_confidence": 0.89,
    "format_valid": true,
    "format_name": "civilian",
    "corrected": true,
    "low_confidence": false,
    "box": { "x1": 412, "y1": 588, "x2": 703, "y2": 655 }
  },
  "plates": [ "..." ],
  "processing_ms": 21.4,
  "provider": "CUDAExecutionProvider"
}
```

| Field | Why it is there |
|---|---|
| `raw` vs `plate` | What the model emitted, versus what post-processing corrected it to |
| `corrected` | True means the string was adjusted — the officer should know before accepting it |
| `format_valid` | Whether it parses as a real Indian plate. False is a warning, never a rejection |
| `low_confidence` | Below `OCR_MIN_CONFIDENCE`; the app opens the field for editing |
| `detection_confidence` | High here with low `confidence` means "plate found but unreadable — move closer", which is different advice from "no plate in frame" |

---

## Stop the Server

Press `CTRL+C` in the terminal where it is running.

---

## Integration with the App

The plate scanner lives in the security gate flow:

**Sign in as Security** (`VITAP-SEC01`) → **Register a visitor** → turn on **Vehicle** →
**Scan the number plate**.

The officer takes **one photo**. The app resizes it to 1280px, sends it to `/read-base64`,
and writes the largest plate into the plate field; any other plates in the photo are listed
to pick from. The same scanner is used on the visitor's **Add Vehicle** screen.
**The plate field is always editable.** Any keystroke marks the record `ocr_edited` and
keeps the original read alongside it, so it stays answerable later whether the model is
helping or being overruled every time.

### Pointing the app at this service

| Situation | What to do |
|---|---|
| Android emulator | Nothing. `10.0.2.2:8002` is the default |
| Physical device, USB | `adb reverse tcp:8002 tcp:8002` |
| Physical device, Wi-Fi | Set the LAN IP in `ReactNative_App\VISION\.env` |

```env
EXPO_PUBLIC_ANPR_API_BASE_URL=http://10.203.39.13:8002/api/v1
```

Running all three backends over USB:

```powershell
adb reverse tcp:3000 tcp:3000; adb reverse tcp:8001 tcp:8001; adb reverse tcp:8002 tcp:8002
```

---

## Troubleshooting

### Port already in use

```powershell
netstat -ano | findstr :8002
taskkill /PID <PID> /F
```

### `provider` says `CPUExecutionProvider`

The most common problem, and it is silent. Run `python scripts\check_gpu.py` for a
diagnosis. Usually one of:

```powershell
# The CPU-only build is installed
pip uninstall onnxruntime
pip install onnxruntime-gpu

# CUDA / cuDNN versions do not match the onnxruntime-gpu build, or are not on PATH
# https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
```

To confirm it is not a configuration problem first, check that `DEVICE` in `.env` is `auto`
or `cuda` rather than `cpu`.

### "No number plate found in the frame"

The detector found nothing. Almost always framing rather than the model: fill the on-screen
guide box with the plate. A plate occupying a tenth of the frame is the single most common
reason a read fails. If plates are genuinely distant, raise the detector resolution in
`.env` — `yolo-v9-t-512-...` or `-640-...`, at roughly 2x and 3x the work.

### "A plate was found but could not be read"

Detection worked, recognition did not. Move closer, change angle to cut glare, or clean the
plate. If it happens constantly at one gate at one time of day, that is a lighting problem
worth fixing physically before it is worth fine-tuning a model for.

### Reads are consistently wrong in the same way

Do not reach for fine-tuning yet. Collect labelled examples and measure first:

```powershell
# 1. Turn on crop capture in .env, then run a shift of real traffic
#    SAVE_CROPS=true

# 2. Build a labels CSV, pre-filled with the model's own reads
python scripts\prepare_dataset.py triage --crops data\crops --out data\datasets\labels.csv

# 3. Correct that CSV by hand — top rows first, they are the doubtful ones

# 4. MEASURE. Exact-match rate, character error rate, and a confusion table
python scripts\benchmark.py --images data\crops --labels data\datasets\labels.csv
```

The confusion table tells you which of the two models is the weak link, or — most often —
that neither is, and a rule in `app\core\postprocess.py` fixes it for free. Only then
consider `scripts\finetune_ocr.py` or `scripts\finetune_detector.py`; both refuse to run on
too little data and explain why in their own `--help`.

> `SAVE_CROPS` writes photographs of real vehicles to disk. It is off by default, it is
> gitignored, and it should stay off unless you are actively collecting.

### Models re-download on every start

The cache directory is not writable or is being cleared. `fast-alpr` caches under
`%USERPROFILE%\.cache\`; check that path exists and is writable.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│             VISION ANPR Backend - Quick Start               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  cd E:\VISION\Backend\ANPR_Backend                          │
│  .\venv\Scripts\python.exe -m uvicorn \                │
│    app.main:app --host 0.0.0.0 --port 8002 \                │
│    --reload                                                 │
│                                                             │
│  Server:  http://localhost:8002                             │
│  API:     http://localhost:8002/api/v1                      │
│  Health:  http://localhost:8002/api/v1/health               │
│  Docs:    http://localhost:8002/docs                        │
│                                                             │
│  GPU check:  python scripts\check_gpu.py                    │
│  Benchmark:  python scripts\benchmark.py --images <dir>     │
│                                                             │
│  Stop:    CTRL+C                                            │
│                                                             │
│  Watch the startup log for:                                 │
│    provider=CUDAExecutionProvider   <- GPU, correct         │
│    provider=CPUExecutionProvider    <- ~15x slower, fix it  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

**Last Updated**: September 16, 2026
**Status**: Built; typechecked and unit-verified. Accuracy on real VIT-AP gate traffic is
not yet measured — see the troubleshooting section above for the order that work goes in.
