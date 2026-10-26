"""
VISION ANPR Backend - FastAPI entrypoint.

Automatic number plate recognition for the gate. Runs alongside the biometric service
rather than inside it: the two have incompatible native dependency trees (TensorFlow
pins CUDA and cuDNN versions that onnxruntime-gpu does not want), and separating them
means a crash in one does not take face matching down with it.

    uvicorn app.main:app --host 0.0.0.0 --port 8002
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import anpr, health
from app.config import settings
from app.core.pipeline import pipeline

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("anpr_backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting VISION ANPR Backend")
    logger.info("Detector: %s | OCR: %s", settings.DETECTOR_MODEL, settings.OCR_MODEL)

    # Warm the models at startup rather than on the first request. The first load pulls
    # ONNX weights from the hub and builds the execution sessions - several seconds, and
    # occasionally a download. A gate officer should never be the one waiting for that.
    try:
        pipeline.load()
        logger.info("Models ready on %s", pipeline.provider)
    except Exception as error:
        # A failed warm-up is logged and the service still starts, so /health can explain
        # what is wrong. Exiting here would leave an officer with a service that is simply
        # absent, and no way to see why.
        logger.error("Model warm-up failed - the service is up but scans will fail: %s", error)

    if settings.SAVE_CROPS:
        logger.warning(
            "SAVE_CROPS is on: plate crops of real vehicles are being written to %s",
            settings.crop_storage_abs_path,
        )

    yield

    logger.info("Shutting down VISION ANPR Backend")


app = FastAPI(
    title="VISION ANPR Backend",
    description=(
        "Automatic number plate recognition for campus gate entry. "
        "Two-stage pipeline: a YOLO plate detector followed by a plate-specific OCR "
        "recogniser, with Indian-format post-processing and temporal voting."
    ),
    version="1.0.0",
    lifespan=lifespan,
    # The interactive docs let anyone try every endpoint. Development only.
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Swagger UI only renders a multi-file picker for an array of `format: binary` under
# OpenAPI 3.0. Labelled 3.1 (FastAPI's default), /read-frames shows a single upload box.
# Set as an attribute: FastAPI does not accept it as a constructor argument.
app.openapi_version = "3.0.3"

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Nothing here uses cookies or credentials.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(anpr.router, prefix="/api/v1")


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """
    Never return a stack trace to a gate device.

    The officer's screen has no use for one, and the detail belongs in the server log
    where it can be read alongside the surrounding requests.
    """
    logger.exception("Unhandled error")

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "detail": "The plate recognition service hit an internal error",
        },
    )


@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {
        "service": "VISION ANPR Backend",
        "health": "/api/v1/health",
    }
