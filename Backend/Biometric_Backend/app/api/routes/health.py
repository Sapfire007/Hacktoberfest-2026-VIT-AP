"""
VISION Biometric Backend — Health Check Route

GET /api/v1/health — Returns service status, model configuration,
and enrollment count.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends

from app.api.dependencies import get_face_engine, get_embedding_store
from app.core.face_engine import FaceEngine
from app.models.schemas import HealthResponse
from app.storage.embedding_store import FileSystemEmbeddingStore

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health check",
    description="Returns the current status of the biometric backend, "
                "including model configuration and enrollment statistics.",
)
async def health_check(
    face_engine: FaceEngine = Depends(get_face_engine),
    store: FileSystemEmbeddingStore = Depends(get_embedding_store),
) -> HealthResponse:
    """Check service health and report configuration."""
    try:
        enrolled_count = await store.count()
        model_info = face_engine.get_model_info()

        return HealthResponse(
            status="healthy",
            service="VISION Biometric Backend",
            model_info=model_info,
            enrolled_users_count=enrolled_count,
            timestamp=datetime.utcnow().isoformat(),
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            service="VISION Biometric Backend",
            model_info={"error": str(e)},
            enrolled_users_count=0,
            timestamp=datetime.utcnow().isoformat(),
        )
