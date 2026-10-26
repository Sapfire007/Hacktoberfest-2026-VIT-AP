"""
Health and readiness.

`/health` answers "is the process up"; `/ready` answers "are the models loaded and will
the next scan be fast". They are separate because the first is true several seconds before
the second, and a gate device that starts scanning during that window gets a timeout that
looks like a network fault.
"""

from fastapi import APIRouter

from app.config import settings
from app.core.pipeline import pipeline
from app.models.schemas import HealthResponse

router = APIRouter(tags=["Health"])

SERVICE_VERSION = "1.0.0"


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="VISION ANPR Backend",
        version=SERVICE_VERSION,
        models_loaded=pipeline.is_loaded,
        provider=pipeline.provider,
        detector_model=settings.DETECTOR_MODEL,
        ocr_model=settings.OCR_MODEL,
    )


@router.get("/ready", response_model=HealthResponse)
async def ready() -> HealthResponse:
    """
    Load the models if they are not loaded yet, then report.

    Deliberately not a passive check: calling this is how a gate device warms a service
    that has just restarted, before a car is waiting at the barrier.
    """
    pipeline.load()

    return HealthResponse(
        status="ready",
        service="VISION ANPR Backend",
        version=SERVICE_VERSION,
        models_loaded=pipeline.is_loaded,
        provider=pipeline.provider,
        detector_model=settings.DETECTOR_MODEL,
        ocr_model=settings.OCR_MODEL,
    )
