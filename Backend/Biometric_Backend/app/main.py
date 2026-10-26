"""
VISION Biometric Backend — Main FastAPI Application Entrypoint
"""

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# ── Force DEEPFACE_HOME to this project directory BEFORE any other import ──
# DeepFace resolves weights as: {DEEPFACE_HOME}/.deepface/weights/<model>.h5
# We MUST set this before importing anything that touches DeepFace/TF/Keras.
BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
os.environ["DEEPFACE_HOME"] = BACKEND_DIR
os.environ["PYTHONIOENCODING"] = "utf-8"

# Validate that the project-local weights directory exists
_LOCAL_WEIGHTS_DIR = os.path.join(BACKEND_DIR, ".deepface", "weights")
_LOCAL_VGG_WEIGHTS = os.path.join(_LOCAL_WEIGHTS_DIR, "vgg_face_weights.h5")
if not os.path.isfile(_LOCAL_VGG_WEIGHTS):
    print(
        f"[CRITICAL] VGG-Face weights NOT found at project-local path:\n"
        f"  {_LOCAL_VGG_WEIGHTS}\n"
        f"  DEEPFACE_HOME is set to: {BACKEND_DIR}\n"
        f"  Please place vgg_face_weights.h5 in {_LOCAL_WEIGHTS_DIR}"
    )
else:
    _size_mb = os.path.getsize(_LOCAL_VGG_WEIGHTS) / (1024 * 1024)
    print(
        f"[DEEPFACE_HOME] Weights locked to project directory:\n"
        f"  DEEPFACE_HOME  = {BACKEND_DIR}\n"
        f"  VGG weights    = {_LOCAL_VGG_WEIGHTS} ({_size_mb:.1f} MB)\n"
        f"  User-home path = IGNORED (will NOT use C:\\Users\\*\\.deepface\\)"
    )

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import enrollment, health, verification
from app.config import settings
from app.core.encryption import EncryptionError

# Configure Logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("biometric_backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup and shutdown tasks."""
    logger.info("Initializing VISION Biometric Backend...")
    logger.info(f"Model: {settings.MODEL_NAME} | Detector: {settings.DETECTOR_BACKEND}")
    logger.info(f"Storage Path: {settings.embedding_storage_abs_path}")
    logger.info(
        f"DEEPFACE_HOME: {os.environ.get('DEEPFACE_HOME', 'NOT SET')} | "
        f"Weights: {_LOCAL_VGG_WEIGHTS} (exists={os.path.isfile(_LOCAL_VGG_WEIGHTS)})"
    )

    # Validate encryption key present
    if not settings.BIOMETRIC_ENCRYPTION_KEY:
        if not settings.DEBUG:
            # Embeddings encrypted with a throwaway key are unreadable after a restart, and
            # a production service should never be running in that state.
            raise RuntimeError(
                "BIOMETRIC_ENCRYPTION_KEY is not set. Generate one with: "
                'python -c "from cryptography.fernet import Fernet; '
                'print(Fernet.generate_key().decode())"'
            )
        from cryptography.fernet import Fernet
        settings.BIOMETRIC_ENCRYPTION_KEY = Fernet.generate_key().decode()
        # The key itself is never printed: it decrypts every embedding stored with it, and
        # logs are kept and shared.
        logger.warning(
            "BIOMETRIC_ENCRYPTION_KEY is NOT set. Using a temporary key for this session: "
            "embeddings enrolled now will be unreadable after a restart. Set a permanent key "
            "in .env - generate one with: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )

    if not settings.REQUIRE_AUTH:
        logger.warning(
            "REQUIRE_AUTH is false: anyone on the network can enrol, replace or delete face "
            "data. Use this for local experiments only."
        )

    yield

    logger.info("Shutting down VISION Biometric Backend...")


app = FastAPI(
    title="VISION — Biometric Backend",
    description=(
        "Facial Biometric Enrollment and Verification Microservice for "
        "VIT Intelligent Surveillance & Identity Operations Network (VISION). "
        "Uses DeepFace (VGG-Face model) and RetinaFace detector."
    ),
    version="1.0.0",
    lifespan=lifespan,
    # The interactive docs list every endpoint and let anyone try them. Development only.
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Callers authenticate with a bearer header, never a cookie.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global Exception Handlers
@app.exception_handler(EncryptionError)
async def encryption_error_handler(request: Request, exc: EncryptionError):
    logger.error(f"Encryption error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "error_code": "ENCRYPTION_ERROR",
                "message": "Biometric encryption operation failed.",
                "guidance": "Internal security error. Contact system administrator.",
            },
        },
    )


# Include Routers
app.include_router(health.router, prefix="/api/v1")
app.include_router(enrollment.router, prefix="/api/v1")
app.include_router(verification.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "service": "VISION Biometric Backend",
        "version": "1.0.0",
        "health": "/api/v1/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
