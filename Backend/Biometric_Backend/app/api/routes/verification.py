"""
VISION Biometric Backend — Verification & Identification Routes

POST /api/v1/biometric/verify    — 1:1 Verification against a specific user_id
POST /api/v1/biometric/identify  — 1:N Search across all enrolled users (Gate Mode)

Implements:
- FR-ENT-02: Face matched against template store (1:1 & 1:N)
- NFR-PERF-01: Low-latency verification (< 2 seconds)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.dependencies import get_face_engine, get_encryptor, get_embedding_store
from app.config import settings
from app.core.auth import Caller, check_user_id, get_caller, require_role, require_self_or_role
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
    ErrorDetail,
    ErrorResponse,
    IdentificationResponse,
    VerificationResponse,
)
from app.storage.embedding_store import EmbeddingStoreError, FileSystemEmbeddingStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/biometric", tags=["Biometric Verification"])


# ============================================================
# POST /api/v1/biometric/verify (1:1 Verification)
# ============================================================

@router.post(
    "/verify",
    response_model=VerificationResponse,
    summary="1:1 Biometric Verification",
    description=(
        "Verifies a live face image against a specific enrolled user's stored embedding. "
        "Returns match decision, distance, confidence score, and threshold."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        404: {"model": ErrorResponse, "description": "User not enrolled"},
    },
)
async def verify_biometric(
    user_id: str = Form(..., description="Target user ID to verify against"),
    image: UploadFile = File(..., description="Live face image capture"),
    face_engine: FaceEngine = Depends(get_face_engine),
    encryptor: EmbeddingEncryptor = Depends(get_encryptor),
    store: FileSystemEmbeddingStore = Depends(get_embedding_store),
    caller: Optional[Caller] = Depends(get_caller),
) -> VerificationResponse:
    """1:1 verification of a live face against an enrolled user's embedding.

    The user themselves, or security and admin at the gate.
    """
    check_user_id(user_id)
    require_self_or_role(caller, user_id, ("security", "admin"))

    # Step 1: Check user exists in store
    encrypted_embedding = await store.retrieve(user_id)
    if not encrypted_embedding:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="USER_NOT_ENROLLED",
                    message=f"No enrolled biometric data found for user '{user_id}'.",
                    guidance="User has not completed biometric enrollment.",
                ),
            ).model_dump(),
        )

    # Step 2: Decrypt stored embedding
    try:
        stored_embedding = encryptor.decrypt_embedding(encrypted_embedding)
    except EncryptionError as e:
        logger.error(f"Failed to decrypt embedding for user '{user_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Stored biometric data decryption failed."},
        )

    # Step 3: Read and validate live image
    file_bytes = await image.read()
    try:
        validate_image_format(
            content_type=image.content_type, filename=image.filename
        )
        validate_image_size(file_bytes, settings.max_image_size_bytes)
        validate_image_readable(file_bytes)

        # Detect face & check liveness
        face_results = face_engine.detect_and_validate(file_bytes)
        face_result = validate_single_face(face_results)
        validate_face_confidence(face_result, settings.MIN_FACE_CONFIDENCE)

        if settings.ANTI_SPOOFING_ENABLED:
            validate_liveness(face_result)

        # Generate live embedding
        live_embedding = face_engine.generate_embedding(file_bytes, face_result=face_result)

    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code=e.error_code,
                    message=str(e),
                    guidance=e.guidance,
                ),
            ).model_dump(),
        )
    except FaceEngineError as e:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="FACE_ENGINE_ERROR",
                    message=str(e),
                    guidance="Could not process live image for verification.",
                ),
            ).model_dump(),
        )

    # Step 4: Compare embeddings
    try:
        distance, is_match, confidence = face_engine.compare_embeddings(
            live_embedding, stored_embedding
        )
    except FaceEngineError as e:
        logger.error(f"Embedding comparison error for user '{user_id}': {e}")
        raise HTTPException(
            status_code=500, detail={"error": "Comparison calculation failed."}
        )

    logger.info(
        f"Verification for user '{user_id}': verified={is_match}, "
        f"distance={distance:.4f}, confidence={confidence:.4f}"
    )

    return VerificationResponse(
        verified=is_match,
        user_id=user_id,
        distance=distance,
        threshold=face_engine.verification_threshold,
        confidence_score=confidence,
        model=face_engine.model_name,
        detector=face_engine.detector_backend,
    )


# ============================================================
# POST /api/v1/biometric/identify (1:N Gate Identification)
# ============================================================

@router.post(
    "/identify",
    response_model=IdentificationResponse,
    summary="1:N Biometric Identification (Gate Mode)",
    description=(
        "Searches across all enrolled user embeddings to find a match for a live face. "
        "Used at security gate check-ins."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
    },
)
async def identify_biometric(
    image: UploadFile = File(..., description="Live face image from gate camera"),
    threshold_override: Optional[float] = Form(
        None, description="Optional distance threshold override"
    ),
    face_engine: FaceEngine = Depends(get_face_engine),
    encryptor: EmbeddingEncryptor = Depends(get_encryptor),
    store: FileSystemEmbeddingStore = Depends(get_embedding_store),
    caller: Optional[Caller] = Depends(get_caller),
) -> IdentificationResponse:
    """1:N search across all enrolled templates. Security and admin only: for anyone
    else it is a way to find out who a photographed stranger is."""
    require_role(caller, ("security", "admin"))

    # Retrieve all stored embeddings
    all_embeddings_encrypted = await store.retrieve_all()
    candidates_count = len(all_embeddings_encrypted)

    if candidates_count == 0:
        return IdentificationResponse(
            match_found=False,
            best_match_user_id=None,
            distance=None,
            threshold=face_engine.verification_threshold,
            confidence_score=None,
            model=face_engine.model_name,
            candidates_searched=0,
        )

    # Read and validate live image
    file_bytes = await image.read()
    try:
        validate_image_format(
            content_type=image.content_type, filename=image.filename
        )
        validate_image_size(file_bytes, settings.max_image_size_bytes)
        validate_image_readable(file_bytes)

        face_results = face_engine.detect_and_validate(file_bytes)
        face_result = validate_single_face(face_results)
        validate_face_confidence(face_result, settings.MIN_FACE_CONFIDENCE)

        if settings.ANTI_SPOOFING_ENABLED:
            validate_liveness(face_result)

        live_embedding = face_engine.generate_embedding(file_bytes, face_result=face_result)

    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code=e.error_code,
                    message=str(e),
                    guidance=e.guidance,
                ),
            ).model_dump(),
        )
    except FaceEngineError as e:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                success=False,
                error=ErrorDetail(
                    error_code="FACE_ENGINE_ERROR",
                    message=str(e),
                    guidance="Could not process image for gate identification.",
                ),
            ).model_dump(),
        )

    # Compare against all candidates
    best_match_id: Optional[str] = None
    min_distance = float("inf")
    best_confidence = 0.0

    # An override may only make matching stricter. A looser threshold turns "closest
    # face" into "a match" for people who are not enrolled at all.
    target_threshold = face_engine.verification_threshold
    if threshold_override is not None and 0 < threshold_override < target_threshold:
        target_threshold = threshold_override

    for user_id, enc_bytes in all_embeddings_encrypted.items():
        try:
            stored_emb = encryptor.decrypt_embedding(enc_bytes)
            distance, is_match, conf = face_engine.compare_embeddings(
                live_embedding, stored_emb, threshold=target_threshold
            )
            if distance < min_distance:
                min_distance = distance
                best_confidence = conf
                if is_match:
                    best_match_id = user_id
        except Exception as e:
            logger.error(f"Failed to compare with candidate '{user_id}': {e}")
            continue

    match_found = best_match_id is not None

    logger.info(
        f"1:N Identification across {candidates_count} users: match={match_found}, "
        f"best_match='{best_match_id}', min_distance={min_distance:.4f}"
    )

    return IdentificationResponse(
        match_found=match_found,
        best_match_user_id=best_match_id,
        distance=round(min_distance, 6) if min_distance != float("inf") else None,
        threshold=target_threshold,
        confidence_score=best_confidence if match_found else None,
        model=face_engine.model_name,
        candidates_searched=candidates_count,
    )
