"""
VISION Biometric Backend — Image & Face Validators

Implements FR-REG-04: system rejects capture on poor lighting, occlusion,
multiple faces detected — with structured error messages for the client
to show inline guidance.
"""

import io
import logging
from typing import Tuple

from PIL import Image

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Raised when image or face validation fails."""

    def __init__(self, message: str, error_code: str, guidance: str = ""):
        """
        Args:
            message: Technical error description.
            error_code: Machine-readable error code (e.g., "NO_FACE_DETECTED").
            guidance: Human-readable fix-it text for the client UI (FR-REG-04).
        """
        super().__init__(message)
        self.error_code = error_code
        self.guidance = guidance


# ----- Image format & size validators -----

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/jpg"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def validate_image_format(content_type: str, filename: str) -> None:
    """
    Validate that the uploaded file is an accepted image format.

    Args:
        content_type: MIME type from the upload header.
        filename: Original filename.

    Raises:
        ValidationError: If the format is not JPEG or PNG.
    """
    # Check MIME type
    if content_type and content_type.lower() not in ALLOWED_MIME_TYPES:
        raise ValidationError(
            message=f"Unsupported image format: {content_type}",
            error_code="INVALID_IMAGE_FORMAT",
            guidance="Please upload a JPEG or PNG image.",
        )

    # Check extension as fallback
    if filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext and ext not in ALLOWED_EXTENSIONS:
            raise ValidationError(
                message=f"Unsupported file extension: {ext}",
                error_code="INVALID_IMAGE_FORMAT",
                guidance="Please upload a JPEG or PNG image.",
            )


def validate_image_size(file_bytes: bytes, max_size_bytes: int) -> None:
    """
    Validate that the image does not exceed the maximum allowed size.

    Args:
        file_bytes: Raw image bytes.
        max_size_bytes: Maximum allowed size in bytes.

    Raises:
        ValidationError: If the image is too large.
    """
    actual_size = len(file_bytes)
    if actual_size > max_size_bytes:
        max_mb = max_size_bytes / (1024 * 1024)
        actual_mb = actual_size / (1024 * 1024)
        raise ValidationError(
            message=f"Image too large: {actual_mb:.1f}MB (max: {max_mb:.0f}MB)",
            error_code="IMAGE_TOO_LARGE",
            guidance=f"Image must be under {max_mb:.0f}MB. Try using a lower resolution.",
        )


def validate_image_readable(file_bytes: bytes) -> Tuple[int, int]:
    """
    Validate that the bytes represent a valid, readable image.

    Args:
        file_bytes: Raw image bytes.

    Returns:
        Tuple of (width, height) of the image.

    Raises:
        ValidationError: If the image cannot be read/decoded.
    """
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()  # Verify it's a valid image
        # Re-open because verify() can close the file
        img = Image.open(io.BytesIO(file_bytes))
        return img.size  # (width, height)
    except Exception as e:
        raise ValidationError(
            message=f"Cannot read image: {e}",
            error_code="IMAGE_UNREADABLE",
            guidance="The image appears to be corrupted. Please try a different photo.",
        )


# ----- Face detection result validators -----

def validate_single_face(face_results: list) -> dict:
    """
    Validate that exactly one face was detected in the image.

    Args:
        face_results: List of face detection results from DeepFace.extract_faces().

    Returns:
        The single detected face result dict.

    Raises:
        ValidationError: If zero or multiple faces are detected.
    """
    if not face_results or len(face_results) == 0:
        raise ValidationError(
            message="No face detected in the image",
            error_code="NO_FACE_DETECTED",
            guidance="Position your face clearly in the frame. Ensure good lighting "
                     "and remove any obstructions.",
        )

    if len(face_results) > 1:
        raise ValidationError(
            message=f"Multiple faces detected ({len(face_results)} faces)",
            error_code="MULTIPLE_FACES_DETECTED",
            guidance="Only one person should be in the frame. Please ensure no one "
                     "else is visible behind you.",
        )

    return face_results[0]


def validate_face_confidence(face_result: dict, min_confidence: float) -> None:
    """
    Validate that the face detection confidence meets the minimum threshold.

    Args:
        face_result: Single face result from DeepFace.extract_faces().
        min_confidence: Minimum required confidence score (0.0 - 1.0).

    Raises:
        ValidationError: If the confidence score is below the threshold.
    """
    confidence = face_result.get("confidence", face_result.get("face_confidence", 0.0))

    # DeepFace uses detector-specific confidence scores, not always normalized probabilities.
    if confidence is None:
        confidence = 0.0

    if confidence < min_confidence:
        raise ValidationError(
            message=f"Face detection confidence too low: {confidence:.2f} "
                    f"(minimum: {min_confidence:.2f})",
            error_code="LOW_CONFIDENCE",
            guidance="The image quality is too low for reliable detection. "
                     "Please ensure good lighting, face the camera directly, "
                     "and remove sunglasses, masks, or hats.",
        )

    logger.debug(f"Face confidence: {confidence:.3f} (threshold: {min_confidence:.2f})")


def validate_liveness(face_result: dict) -> None:
    """
    Validate that the detected face passes the anti-spoofing / liveness check.

    Args:
        face_result: Single face result from DeepFace.extract_faces(anti_spoofing=True).

    Raises:
        ValidationError: If the face is detected as a spoof.
    """
    is_real = face_result.get("is_real")

    # If anti-spoofing wasn't run, is_real won't be in the result — skip check
    if is_real is None:
        logger.warning("Anti-spoofing result not available — skipping liveness check")
        return

    if not is_real:
        antispoof_score = face_result.get("antispoof_score", "N/A")
        raise ValidationError(
            message=f"Spoof detected — face does not appear to be a live person "
                    f"(antispoof_score: {antispoof_score})",
            error_code="SPOOF_DETECTED",
            guidance="Please use a live camera capture, not a photo of a photo or "
                     "a screen. Ensure your face is directly in front of the camera.",
        )

    logger.debug(
        f"Liveness check passed (antispoof_score: "
        f"{face_result.get('antispoof_score', 'N/A')})"
    )
