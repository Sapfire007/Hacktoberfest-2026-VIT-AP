"""
VISION Biometric Backend — Pydantic Schemas

Request/response models for all API endpoints.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ============================================================
# Health
# ============================================================

class HealthResponse(BaseModel):
    """Response schema for the health check endpoint."""
    status: str = Field(..., description="Service status", examples=["healthy"])
    service: str = Field(
        default="VISION Biometric Backend",
        description="Service name",
    )
    model_info: dict = Field(
        default_factory=dict,
        description="Current model configuration and load status",
    )
    enrolled_users_count: int = Field(
        default=0,
        description="Number of users with stored embeddings",
    )
    timestamp: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
        description="Current server timestamp (UTC)",
    )


# ============================================================
# Enrollment
# ============================================================

class EnrollmentResponse(BaseModel):
    """Response schema for successful biometric enrollment."""
    success: bool = Field(default=True, description="Whether enrollment succeeded")
    user_id: str = Field(..., description="Enrolled user's unique ID")
    message: str = Field(..., description="Human-readable result message")
    faces_processed: int = Field(
        ..., description="Number of face images successfully processed"
    )
    embedding_dimensions: int = Field(
        ..., description="Dimensionality of the stored embedding vector"
    )
    encrypted_embedding: Optional[str] = Field(
        default=None,
        description="Base64-encoded encrypted embedding for Firebase Cloud Firestore storage",
    )
    model_name: Optional[str] = Field(
        default="VGG-Face",
        description="Face model name used for embedding generation",
    )
    detector_backend: Optional[str] = Field(
        default="opencv",
        description="Detector backend used for face localization",
    )


class ReEnrollmentResponse(BaseModel):
    """Response schema for biometric re-enrollment."""
    success: bool = Field(default=True)
    user_id: str = Field(..., description="Re-enrolled user's unique ID")
    message: str = Field(..., description="Human-readable result message")
    faces_processed: int = Field(...)
    embedding_dimensions: int = Field(...)
    previous_enrollment_archived: bool = Field(
        default=True,
        description="Whether the previous embedding was archived before overwriting",
    )
    encrypted_embedding: Optional[str] = Field(
        default=None,
        description="Base64-encoded encrypted embedding for Firebase Cloud Firestore storage",
    )
    model_name: Optional[str] = Field(
        default="VGG-Face",
        description="Face model name used for embedding generation",
    )
    detector_backend: Optional[str] = Field(
        default="opencv",
        description="Detector backend used for face localization",
    )


# ============================================================
# Verification (1:1)
# ============================================================

class VerificationResponse(BaseModel):
    """Response schema for 1:1 biometric verification."""
    verified: bool = Field(..., description="Whether the face matches the enrolled user")
    user_id: str = Field(..., description="The user ID verified against")
    distance: float = Field(
        ..., description="Computed distance between embeddings (lower = more similar)"
    )
    threshold: float = Field(
        ..., description="Distance threshold used for the match decision"
    )
    confidence_score: float = Field(
        ...,
        description="Normalized confidence score (0.0 to 1.0, higher = more confident)",
    )
    model: str = Field(..., description="Recognition model used")
    detector: str = Field(..., description="Face detector backend used")


# ============================================================
# Identification (1:N)
# ============================================================

class IdentificationResponse(BaseModel):
    """Response schema for 1:N biometric identification (gate search)."""
    match_found: bool = Field(
        ..., description="Whether a matching enrolled user was found"
    )
    best_match_user_id: Optional[str] = Field(
        None, description="User ID of the best match (null if no match)"
    )
    distance: Optional[float] = Field(
        None, description="Distance to the best match"
    )
    threshold: float = Field(
        ..., description="Distance threshold used"
    )
    confidence_score: Optional[float] = Field(
        None, description="Confidence score for the best match"
    )
    model: str = Field(..., description="Recognition model used")
    candidates_searched: int = Field(
        ..., description="Number of enrolled users searched against"
    )


# ============================================================
# Enrollment Status
# ============================================================

class EnrollmentStatusResponse(BaseModel):
    """Response schema for checking enrollment status."""
    user_id: str = Field(..., description="The user ID checked")
    is_enrolled: bool = Field(
        ..., description="Whether the user has a stored biometric embedding"
    )
    enrolled_at: Optional[str] = Field(
        None, description="Timestamp of enrollment (if available)"
    )


# ============================================================
# Deletion
# ============================================================

class DeletionResponse(BaseModel):
    """Response schema for biometric data deletion."""
    success: bool = Field(default=True)
    user_id: str = Field(..., description="The user whose data was deleted")
    message: str = Field(..., description="Human-readable result message")


# ============================================================
# Error responses
# ============================================================

class ErrorDetail(BaseModel):
    """Structured error detail for client-side handling."""
    error_code: str = Field(
        ...,
        description="Machine-readable error code",
        examples=["NO_FACE_DETECTED", "SPOOF_DETECTED", "MULTIPLE_FACES_DETECTED"],
    )
    message: str = Field(..., description="Technical error description")
    guidance: str = Field(
        default="",
        description="Human-readable fix-it guidance for the user (FR-REG-04)",
    )


class ErrorResponse(BaseModel):
    """Standard error response body."""
    success: bool = Field(default=False)
    error: ErrorDetail
