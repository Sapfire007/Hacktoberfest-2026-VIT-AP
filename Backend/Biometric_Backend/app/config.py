"""
VISION Biometric Backend — Configuration

All settings are loaded from environment variables (via .env file).
Uses Pydantic BaseSettings for validation and type coercion.
"""

import os
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings
from pydantic import field_validator


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- Server ---
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    DEBUG: bool = True

    # --- DeepFace Model Configuration ---
    MODEL_NAME: str = "VGG-Face"
    DETECTOR_BACKEND: str = "retinaface"
    DISTANCE_METRIC: str = "cosine"
    VERIFICATION_THRESHOLD: float = 0.40
    MIN_FACE_CONFIDENCE: float = 0.90
    ANTI_SPOOFING_ENABLED: bool = True

    # --- Security ---
    BIOMETRIC_ENCRYPTION_KEY: str = ""

    # Every request must carry the caller's Firebase ID token, which Node_Backend verifies
    # (app/core/auth.py). false restores the old open behaviour - for local experiments only.
    REQUIRE_AUTH: bool = True
    # Where Node_Backend's API is, for the token check.
    NODE_API_BASE_URL: str = "http://localhost:3000/api"

    # --- Storage ---
    EMBEDDING_STORAGE_PATH: str = "data/embeddings"

    # --- Upload Limits ---
    MAX_IMAGE_SIZE_MB: int = 10

    # --- CORS ---
    # Browser origins allowed to call this service. Empty: none. The app is native and
    # needs no CORS; "*" would let any web page on the campus network call it.
    CORS_ORIGINS: str = ""

    @field_validator("MODEL_NAME")
    @classmethod
    def validate_model_name(cls, v: str) -> str:
        allowed_models = [
            "VGG-Face", "Facenet", "Facenet512", "OpenFace",
            "DeepFace", "DeepID", "ArcFace", "Dlib", "SFace",
            "GhostFaceNet",
        ]
        if v not in allowed_models:
            raise ValueError(
                f"Invalid model_name '{v}'. Allowed: {allowed_models}"
            )
        return v

    @field_validator("DETECTOR_BACKEND")
    @classmethod
    def validate_detector_backend(cls, v: str) -> str:
        allowed_backends = [
            "opencv", "ssd", "dlib", "mtcnn",
            "retinaface", "mediapipe", "yolov8",
        ]
        if v not in allowed_backends:
            raise ValueError(
                f"Invalid detector_backend '{v}'. Allowed: {allowed_backends}"
            )
        return v

    @field_validator("DISTANCE_METRIC")
    @classmethod
    def validate_distance_metric(cls, v: str) -> str:
        allowed_metrics = ["cosine", "euclidean", "euclidean_l2"]
        if v not in allowed_metrics:
            raise ValueError(
                f"Invalid distance_metric '{v}'. Allowed: {allowed_metrics}"
            )
        return v

    @property
    def max_image_size_bytes(self) -> int:
        """Maximum image size in bytes."""
        return self.MAX_IMAGE_SIZE_MB * 1024 * 1024

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS into a list."""
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def embedding_storage_abs_path(self) -> Path:
        """Get absolute path for embedding storage."""
        base_dir = Path(__file__).resolve().parent.parent
        storage_path = base_dir / self.EMBEDDING_STORAGE_PATH
        storage_path.mkdir(parents=True, exist_ok=True)
        return storage_path

    model_config = {
        "env_file": os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            ".env"
        ),
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


# Singleton settings instance
settings = Settings()
