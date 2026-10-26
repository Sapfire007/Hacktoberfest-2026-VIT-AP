"""
VISION Biometric Backend — Enrollment Routes

POST /api/v1/biometric/enroll     — First-time biometric enrollment
POST /api/v1/biometric/re-enroll  — Re-enrollment (overwrite with archive)
GET  /api/v1/biometric/{user_id}/status — Check enrollment status
DELETE /api/v1/biometric/{user_id}      — Delete biometric data

Implements:
- FR-REG-03: Multi-angle guided capture (accepts 1-4 images)
- FR-REG-04: Rejects poor quality / occlusion / multiple faces
- FR-REG-06: Consent enforcement
- FR-PROF-02: Re-enrollment support
- NFR-SEC-01: Encrypted embedding storage
"""

import base64
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.dependencies import get_face_engine, get_encryptor, get_embedding_store
from app.config import settings
from app.core.auth import Caller, check_user_id, get_caller, require_self_or_role
from app.core.encryption import EmbeddingEncryptor, EncryptionError
from app.core.face_engine import FaceEngine, FaceEngineError
from app.core.validators import (
    ValidationError,
    validate_face_confidence,
    validate_image_format,
    validate_image_readable,
    validate_image_size,
    validate_liveness,
    validate_single_face,
)
from app.models.schemas import (
    DeletionResponse,
    EnrollmentResponse,
    EnrollmentStatusResponse,
    ErrorDetail,
    ErrorResponse,
    ReEnrollmentResponse,
)
from app.storage.embedding_store import EmbeddingStoreError, FileSystemEmbeddingStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/biometric", tags=["Biometric Enrollment"])


async def _process_face_images(
    images: List[UploadFile],
    face_engine: FaceEngine,
) -> List[List[float]]:
    """
    Process a list of uploaded face images through the validation and
    embedding pipeline.

    For each image:
    1. Validate format and size
    2. Detect face — check single face, confidence, liveness
    3. Extract embedding

    Args:
        images: Uploaded face image files.
        face_engine: The face engine instance.

    Returns:
        List of embedding vectors (one per successfully processed image).

    Raises:
        HTTPException: With 400 status and structured error on validation failure.
    """
    embeddings = []

    for i, image_file in enumerate(images, start=1):
        image_label = f"Image {i}/{len(images)}"

        # Read image bytes
        file_bytes = await image_file.read()

        try:
            # Step 1: Validate image format and size
            validate_image_format(
                content_type=image_file.content_type,
                filename=image_file.filename,
            )
            validate_image_size(file_bytes, settings.max_image_size_bytes)
            validate_image_readable(file_bytes)

            # Step 2: Detect faces with quality + liveness checks
            face_results = face_engine.detect_and_validate(file_bytes)

            # Validate exactly 1 face
            face_result = validate_single_face(face_results)

            # Validate confidence
            validate_face_confidence(face_result, settings.MIN_FACE_CONFIDENCE)

            # Validate liveness (anti-spoofing)
            if settings.ANTI_SPOOFING_ENABLED:
                validate_liveness(face_result)

            # Step 3: Generate embedding
            embedding = face_engine.generate_embedding(file_bytes, face_result=face_result)
            embeddings.append(embedding)

            logger.info(
                f"{image_label}: Processed successfully "
                f"(confidence={face_result.get('confidence', face_result.get('face_confidence', 'N/A')):.3f})"
            )

        except ValidationError as e:
            logger.warning(f"{image_label}: Validation failed — {e.error_code}: {e}")
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    success=False,
                    error=ErrorDetail(
                        error_code=e.error_code,
                        message=f"{image_label}: {str(e)}",
                        guidance=e.guidance,
                    ),
                ).model_dump(),
            )

        except FaceEngineError as e:
            logger.error(f"{image_label}: Face engine error — {e}")
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    success=False,
                    error=ErrorDetail(
                        error_code="FACE_ENGINE_ERROR",
                        message=f"{image_label}: {str(e)}",
                        guidance="There was an issue processing your photo. "
                                 "Please try again with a clearer image.",
                    ),
                ).model_dump(),
            )

    return embeddings


# ============================================================
# POST /api/v1/biometric/enroll
# ============================================================

@router.post(
    "/enroll",
    response_model=EnrollmentResponse,
    status_code=201,
    summary="Enroll a user's biometric data",
    description=(
        "Accepts 1–4 face images (frontal, left, right, tilt), validates each for "
        "quality and liveness, generates a composite facial embedding, encrypts it, "
        "and stores it securely. Requires explicit consent. "
        "Implements FR-REG-03, FR-REG-04, FR-REG-06, NFR-SEC-01."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        409: {"model": ErrorResponse, "description": "User already enrolled"},
    },
)
async def enroll_biometric(
    user_id: str = Form(
        ..., description="Unique user identifier from the main backend"
    ),
    consent_given: bool = Form(
        ..., description="Explicit biometric consent (FR-REG-06). Must be true."
    ),
    images: List[UploadFile] = File(
        ..., description="1–4 face images (frontal, left, right, tilt)"
    ),
    face_engine: FaceEngine = Depends(get_face_engine),
    encryptor: EmbeddingEncryptor = Depends(get_encryptor),
    store: FileSystemEmbeddingStore = Depends(get_embedding_store),
    caller: Optional[Caller] = Depends(get_caller),
) -> EnrollmentResponse:
    """
    Biometric enrollment endpoint.

    Called during user registration (FR-REG-03). The React Native app captures
    multi-angle face images and submits them here for processing.

    A user enrols only their own face: `user_id` must be the signed-in caller.
    """
    check_user_id(user_id)
    require_self_or_role(caller, user_id)

    # --- Consent check (FR-REG-06) ---
    if not consent_given:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="CONSENT_REQUIRED",
                    message="Biometric consent must be explicitly given before enrollment.",
                    guidance="Please accept the biometric data consent to continue.",
                ),
            ).model_dump(),
        )

    # --- Check if already enrolled ---
    if await store.exists(user_id):
        raise HTTPException(
            status_code=409,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="ALREADY_ENROLLED",
                    message=f"User '{user_id}' is already enrolled. "
                            f"Use /re-enroll to update biometric data.",
                    guidance="You are already registered. Use the re-enrollment "
                             "option if you need to update your biometric data.",
                ),
            ).model_dump(),
        )

    # --- Validate image count ---
    if len(images) < 1 or len(images) > 4:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="INVALID_IMAGE_COUNT",
                    message=f"Expected 1–4 images, received {len(images)}.",
                    guidance="Please provide between 1 and 4 face images.",
                ),
            ).model_dump(),
        )

    # --- Process all images ---
    embeddings = await _process_face_images(images, face_engine)

    if not embeddings:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="NO_VALID_EMBEDDINGS",
                    message="No valid facial embeddings could be extracted.",
                    guidance="None of the uploaded images passed validation. "
                             "Please try again with clearer photos.",
                ),
            ).model_dump(),
        )

    # --- Compute composite embedding ---
    try:
        composite_embedding = face_engine.compute_composite_embedding(embeddings)
    except FaceEngineError as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})

    # --- Encrypt embedding (NFR-SEC-01) ---
    try:
        encrypted = encryptor.encrypt_embedding(composite_embedding)
    except EncryptionError as e:
        logger.error(f"Encryption failed for user '{user_id}': {e}")
        raise HTTPException(status_code=500, detail={"error": "Encryption failed"})

    # --- Store encrypted embedding ---
    try:
        metadata = {
            "model_name": face_engine.model_name,
            "detector_backend": face_engine.detector_backend,
            "faces_processed": len(embeddings),
            "embedding_dimensions": len(composite_embedding),
        }
        await store.store(user_id, encrypted, metadata=metadata)
    except EmbeddingStoreError as e:
        logger.error(f"Storage failed for user '{user_id}': {e}")
        raise HTTPException(status_code=500, detail={"error": "Storage failed"})

    logger.info(
        f"Enrollment complete for user '{user_id}': "
        f"{len(embeddings)} faces -> {len(composite_embedding)}-dim composite"
    )

    encrypted_b64 = base64.b64encode(encrypted).decode("utf-8")

    return EnrollmentResponse(
        success=True,
        user_id=user_id,
        message="Biometric enrollment successful",
        faces_processed=len(embeddings),
        embedding_dimensions=len(composite_embedding),
        encrypted_embedding=encrypted_b64,
        model_name=face_engine.model_name,
        detector_backend=face_engine.detector_backend,
    )


# ============================================================
# POST /api/v1/biometric/re-enroll
# ============================================================

@router.post(
    "/re-enroll",
    response_model=ReEnrollmentResponse,
    summary="Re-enroll a user's biometric data",
    description=(
        "Re-runs biometric enrollment for an already-enrolled user. "
        "Archives the previous embedding before overwriting. "
        "Implements FR-PROF-02."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        404: {"model": ErrorResponse, "description": "User not enrolled"},
    },
)
async def re_enroll_biometric(
    user_id: str = Form(..., description="User ID to re-enroll"),
    consent_given: bool = Form(..., description="Biometric consent (must be true)"),
    images: List[UploadFile] = File(..., description="1–4 face images"),
    face_engine: FaceEngine = Depends(get_face_engine),
    encryptor: EmbeddingEncryptor = Depends(get_encryptor),
    store: FileSystemEmbeddingStore = Depends(get_embedding_store),
    caller: Optional[Caller] = Depends(get_caller),
) -> ReEnrollmentResponse:
    """Re-enrollment endpoint — overwrites previous biometric with archive.

    Only the user themselves: replacing someone else's template would let the replacer
    be recognised as them.
    """
    check_user_id(user_id)
    require_self_or_role(caller, user_id)

    if not consent_given:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="CONSENT_REQUIRED",
                    message="Biometric consent required for re-enrollment.",
                    guidance="Please accept the biometric data consent to continue.",
                ),
            ).model_dump(),
        )

    # Check user exists
    if not await store.exists(user_id):
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="NOT_ENROLLED",
                    message=f"User '{user_id}' is not enrolled. Use /enroll first.",
                    guidance="You must be enrolled before you can re-enroll.",
                ),
            ).model_dump(),
        )

    if len(images) < 1 or len(images) > 4:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="INVALID_IMAGE_COUNT",
                    message=f"Expected 1–4 images, received {len(images)}.",
                    guidance="Please provide between 1 and 4 face images.",
                ),
            ).model_dump(),
        )

    # Archive old embedding
    archived = await store.archive_embedding(user_id)

    # Process new images
    embeddings = await _process_face_images(images, face_engine)
    if not embeddings:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="NO_VALID_EMBEDDINGS",
                    message="No valid embeddings extracted from uploaded images.",
                    guidance="Please try again with clearer photos.",
                ),
            ).model_dump(),
        )

    composite = face_engine.compute_composite_embedding(embeddings)
    encrypted = encryptor.encrypt_embedding(composite)

    metadata = {
        "model_name": face_engine.model_name,
        "detector_backend": face_engine.detector_backend,
        "faces_processed": len(embeddings),
        "embedding_dimensions": len(composite),
        "is_re_enrollment": True,
    }
    await store.store(user_id, encrypted, metadata=metadata)

    logger.info(f"Re-enrollment complete for user '{user_id}'")

    encrypted_b64 = base64.b64encode(encrypted).decode("utf-8")

    return ReEnrollmentResponse(
        success=True,
        user_id=user_id,
        message="Biometric re-enrollment successful",
        faces_processed=len(embeddings),
        embedding_dimensions=len(composite),
        previous_enrollment_archived=archived,
        encrypted_embedding=encrypted_b64,
        model_name=face_engine.model_name,
        detector_backend=face_engine.detector_backend,
    )


# ============================================================
# GET /api/v1/biometric/{user_id}/status
# ============================================================

@router.get(
    "/{user_id}/status",
    response_model=EnrollmentStatusResponse,
    summary="Check enrollment status",
    description="Check if a user has a stored biometric embedding.",
)
async def get_enrollment_status(
    user_id: str,
    store: FileSystemEmbeddingStore = Depends(get_embedding_store),
    caller: Optional[Caller] = Depends(get_caller),
) -> EnrollmentStatusResponse:
    """Check whether a user is enrolled. The user, or security and admin."""
    check_user_id(user_id)
    require_self_or_role(caller, user_id, ("security", "admin"))
    is_enrolled = await store.exists(user_id)
    metadata = await store.get_metadata(user_id) if is_enrolled else None

    return EnrollmentStatusResponse(
        user_id=user_id,
        is_enrolled=is_enrolled,
        enrolled_at=metadata.get("enrolled_at") if metadata else None,
    )


# ============================================================
# DELETE /api/v1/biometric/{user_id}
# ============================================================

@router.delete(
    "/{user_id}",
    response_model=DeletionResponse,
    summary="Delete biometric data",
    description="Permanently delete a user's stored biometric embedding.",
    responses={
        404: {"model": ErrorResponse, "description": "User not found"},
    },
)
async def delete_biometric(
    user_id: str,
    store: FileSystemEmbeddingStore = Depends(get_embedding_store),
    caller: Optional[Caller] = Depends(get_caller),
) -> DeletionResponse:
    """Delete a user's biometric data. The user themselves, or admin."""
    check_user_id(user_id)
    require_self_or_role(caller, user_id, ("admin",))
    deleted = await store.delete(user_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="NOT_FOUND",
                    message=f"No biometric data found for user '{user_id}'.",
                    guidance="",
                ),
            ).model_dump(),
        )

    return DeletionResponse(
        success=True,
        user_id=user_id,
        message="Biometric data deleted successfully",
    )
