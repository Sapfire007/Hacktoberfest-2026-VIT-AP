# VISION — Biometric Backend

**Facial biometric enrollment and verification service** for the VISION campus access management system.

Built with **FastAPI** + **DeepFace** (VGG-Face model) + **RetinaFace** detector.

---

## Overview

This service handles:

1. **Biometric Enrollment** — During user registration, accepts multi-angle face images (frontal, left, right, tilt), validates quality/liveness, generates a composite facial embedding, encrypts it, and stores it securely.

2. **1:1 Verification** — Given a user ID and a live face image, verifies identity against the stored embedding.

3. **1:N Identification** — Given a live face image, searches across all stored embeddings to find the best match (used at the gate).

All embeddings are stored as **AES-encrypted vectors** — never raw images — per the VISION security requirements (NFR-SEC-01).

---

## Quick Start

### Prerequisites

- Python 3.11+
- pip

### Setup

```bash
# 1. Navigate to this directory
cd Backend/Biometric_Backend

# 2. Activate the existing virtual environment
.\.venv\Scripts\Activate.ps1   # PowerShell
# .\.venv\Scripts\activate.bat  # Command Prompt
# source .venv/bin/activate     # Linux/macOS

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env from template
copy .env.example .env       # Windows
# cp .env.example .env       # Linux/macOS

# 5. Generate encryption key and add it to .env
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Copy the output into BIOMETRIC_ENCRYPTION_KEY in .env

# 6. Start the server
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### API Documentation

Once running, visit:
- **Swagger UI**: [http://localhost:8001/docs](http://localhost:8001/docs)
- **ReDoc**: [http://localhost:8001/redoc](http://localhost:8001/redoc)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Service health check |
| `POST` | `/api/v1/biometric/enroll` | Enroll a user with face images |
| `POST` | `/api/v1/biometric/re-enroll` | Re-enroll (overwrite existing) |
| `POST` | `/api/v1/biometric/verify` | 1:1 verify against a specific user |
| `POST` | `/api/v1/biometric/identify` | 1:N search across all enrolled users |
| `DELETE` | `/api/v1/biometric/{user_id}` | Delete a user's biometric data |
| `GET` | `/api/v1/biometric/{user_id}/status` | Check enrollment status |

---

## Architecture

```
app/
├── main.py              # FastAPI application entry point
├── config.py            # Pydantic settings from .env
├── api/
│   ├── dependencies.py  # Shared DI (face engine, store instances)
│   └── routes/
│       ├── health.py
│       ├── enrollment.py
│       └── verification.py
├── core/
│   ├── face_engine.py   # DeepFace VGG-Face pipeline (detect, embed, compare)
│   ├── encryption.py    # AES (Fernet) encryption for embeddings
│   └── validators.py    # Image quality + face validation checks
├── models/
│   └── schemas.py       # Pydantic request/response schemas
└── storage/
    └── embedding_store.py  # Abstract store + file-system impl
```

---

## Configuration

All settings are configurable via `.env`. See `.env.example` for the full list.

Key settings:
- `MODEL_NAME` — Face recognition model (default: `VGG-Face`)
- `DETECTOR_BACKEND` — Face detector (default: `retinaface`)
- `VERIFICATION_THRESHOLD` — Cosine distance threshold (default: `0.40`)
- `ANTI_SPOOFING_ENABLED` — Liveness detection (default: `true`)
- `BIOMETRIC_ENCRYPTION_KEY` — **Required** — Fernet key for encrypting embeddings

---

## Security Notes

- Embeddings are **encrypted at rest** using Fernet (AES) symmetric encryption
- Raw face images are processed **in-memory only** and never written to disk
- The encryption key must be kept secret — rotate it requires re-enrollment of all users
- Anti-spoofing (passive liveness detection) is enabled by default

---

## Testing

```bash
python -m pytest tests/ -v
```

---

## Related PRD Requirements

- **FR-REG-03** — Multi-angle biometric capture
- **FR-REG-04** — Quality rejection (lighting, occlusion, multiple faces)
- **NFR-SEC-01** — Encrypted embeddings, not raw images
- **NFR-PERF-01** — < 2 second verification
- **NFR-MAINT-01** — Swappable models via config
- **NFR-ACC-01** — FAR ≤ 0.1%, FRR ≤ 3%
