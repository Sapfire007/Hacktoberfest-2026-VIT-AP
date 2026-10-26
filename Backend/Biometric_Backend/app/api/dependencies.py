"""
VISION Biometric Backend — Shared Dependencies

FastAPI dependency injection for the FaceEngine, EmbeddingStore,
and EmbeddingEncryptor singletons. These are created once at app
startup and shared across all route handlers.
"""

import logging
from functools import lru_cache

from app.config import settings
from app.core.encryption import EmbeddingEncryptor
from app.core.face_engine import FaceEngine
from app.storage.embedding_store import FileSystemEmbeddingStore

logger = logging.getLogger(__name__)


@lru_cache()
def get_face_engine() -> FaceEngine:
    """
    Get the singleton FaceEngine instance.

    Configuration is loaded from app settings (which come from .env).
    The model is loaded lazily on first use, not at import time.
    """
    engine = FaceEngine(
        model_name=settings.MODEL_NAME,
        detector_backend=settings.DETECTOR_BACKEND,
        distance_metric=settings.DISTANCE_METRIC,
        verification_threshold=settings.VERIFICATION_THRESHOLD,
        min_face_confidence=settings.MIN_FACE_CONFIDENCE,
        anti_spoofing=settings.ANTI_SPOOFING_ENABLED,
    )
    logger.info("FaceEngine dependency created.")
    return engine


@lru_cache()
def get_encryptor() -> EmbeddingEncryptor:
    """
    Get the singleton EmbeddingEncryptor instance.

    Requires BIOMETRIC_ENCRYPTION_KEY to be set in .env.
    """
    encryptor = EmbeddingEncryptor(settings.BIOMETRIC_ENCRYPTION_KEY)
    logger.info("EmbeddingEncryptor dependency created.")
    return encryptor


@lru_cache()
def get_embedding_store() -> FileSystemEmbeddingStore:
    """
    Get the singleton FileSystemEmbeddingStore instance.

    Uses the configured storage path from settings.
    Swap this to return a different EmbeddingStore implementation
    (e.g., PostgreSQL/pgvector) when migrating storage backends.
    """
    store = FileSystemEmbeddingStore(settings.embedding_storage_abs_path)
    logger.info("FileSystemEmbeddingStore dependency created.")
    return store
