# Biometric Backend Server - Startup Guide

## Quick Start (Windows PowerShell)

### Method 1: Single Command with `venv_deepface` (Recommended - Full ML / DeepFace)
```powershell
cd c:\Users\toni5\Desktop\VISION\VISION\Backend\Biometric_Backend; .\venv_deepface\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Method 2: Step by Step
```powershell
# 1. Navigate to the Biometric Backend directory
cd c:\Users\toni5\Desktop\VISION\VISION\Backend\Biometric_Backend

# 2. Activate Python 3.11 virtual environment
.\venv_deepface\Scripts\activate

# 3. Start the server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

---

## Virtual Environments in this Project

| Environment | Python Version | Purpose / Stack |
|---|---|---|
| `.\venv_deepface` | **Python 3.11.9** | **Primary / Full Stack**: DeepFace (`v0.0.100`), TensorFlow (`2.21.0`), tf-keras (`2.21.0`), OpenCV (`5.0.0`), FastAPI (`0.141.1`), Uvicorn, Cryptography. |
| `.\venv` | **Python 3.14.7** | **Lightweight / Fallback**: FastAPI, OpenCV, NumPy (For non-TF environments). |

---

## Server Information

| Setting | Value |
|---------|-------|
| **Host** | `0.0.0.0` (all network interfaces) |
| **Port** | `8001` |
| **URL (Local)** | http://localhost:8001 |
| **URL (Network)** | http://10.85.164.146:8001 |
| **API Base** | http://10.85.164.146:8001/api/v1 |
| **Model Weights Path** | `Backend\Biometric_Backend\.deepface\weights\` (Project-contained) |
| **Auto-reload** | Enabled (for development) |

---

## Verify Server is Running

### 1. Check Console Output
You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
INFO:     Started reloader process [xxxxx] using WatchFiles
INFO:     Started server process [xxxxx]
INFO:     Application startup complete.
```

### 2. Test Health Endpoint
```powershell
# In PowerShell:
Invoke-RestMethod -Uri "http://localhost:8001/api/v1/health" | ConvertTo-Json
```

Expected response:
```json
{
  "status": "healthy",
  "service": "VISION Biometric Backend",
  "model_info": {
    "engine": "DeepFace",
    "model_name": "VGG-Face",
    "detector_backend": "opencv",
    "distance_metric": "cosine",
    "verification_threshold": 0.4,
    "min_face_confidence": 0.9,
    "anti_spoofing_enabled": false,
    "model_loaded": false
  },
  "enrolled_users_count": 4,
  "timestamp": "2026-08-30T..."
}
```

### 3. Open API Documentation
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc

Only with `DEBUG=true`; with `DEBUG=false` the docs are switched off.

### 4. Sign-in is required
Every biometric request must carry the caller's Firebase ID token
(`Authorization: Bearer <token>`), which this service checks with Node_Backend. So:

- **Start Node_Backend first.** With Node unreachable, enrolment answers 503 "Could not
  verify your sign-in". If Node is not on this machine at port 3000, set `NODE_API_BASE_URL`.
- Calling an endpoint from Swagger or curl without a token gives 401.
- For a local experiment without the app, `REQUIRE_AUTH=false` in `.env` turns the check
  off. Never leave it off on a shared network.
- Keep `CORS_ORIGINS` empty: the app is native and needs none.

---

## Stop the Server

Press `CTRL+C` in the terminal where the server is running.

---

## Troubleshooting

### Port Already in Use
```powershell
# Find process using port 8001
netstat -ano | findstr :8001

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Python / Virtual Environment Selection
Always use `.\venv_deepface\Scripts\python.exe` for running biometric recognition:
```powershell
.\venv_deepface\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Model Weights Storage
All model weights are stored strictly within the project directory to prevent system disk clutter:
- `Backend\Biometric_Backend\.deepface\weights\vgg_face_weights.h5`
- Environment variable `DEEPFACE_HOME` is automatically managed in `app/main.py` pointing to `Backend/Biometric_Backend`.

---

## Integration with Frontend

Once the server is running:

1. ✅ Backend accessible at: `http://10.85.164.146:8001`
2. ✅ Frontend `.env` (`ReactNative_App/VISION/.env`):
   ```env
   EXPO_PUBLIC_BIOMETRIC_API_BASE_URL=http://10.85.164.146:8001/api/v1
   ```
3. ✅ Start React Native app:
   ```powershell
   cd ReactNative_App\VISION
   npx expo start
   ```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│          VISION Biometric Backend - Quick Start             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  cd Backend\Biometric_Backend                               │
│  .\venv_deepface\Scripts\python.exe -m uvicorn \            │
│    app.main:app --host 0.0.0.0 --port 8001 \                │
│    --reload                                                 │
│                                                             │
│  Server:  http://10.85.164.146:8001                         │
│  API:     http://10.85.164.146:8001/api/v1                  │
│  Health:  http://localhost:8001/api/v1/health               │
│  Docs:    http://localhost:8001/docs                        │
│                                                             │
│  Stop:    CTRL+C                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

**Last Updated**: August 30, 2026  
**Status**: ✅ Tested and Active