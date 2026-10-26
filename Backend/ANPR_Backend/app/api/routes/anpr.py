"""
ANPR endpoints.

Three ways to read a plate:

- `POST /read-base64` takes one image as base64 in a JSON body. **This is what the mobile
  app uses.** Expo SDK 57's `fetch` cannot send React Native's `{ uri, name, type }` file
  parts ("Unsupported FormDataPart implementation"), and plain JSON works with any client.
- `POST /read` takes one image as a multipart upload. For Swagger, curl and other tools.
- `POST /read-frames` takes several frames of the same vehicle and majority-votes the
  result. Useful for fixed gate cameras, where extra frames cost nothing.

Both return every candidate, never just a winner. A plate the officer has to correct is a
normal outcome, not an error, and the UI is built around correcting rather than accepting.
"""

from __future__ import annotations

import base64
import binascii
import logging
import time
import uuid
from datetime import datetime
from typing import List, Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.config import settings
from app.core.pipeline import Detection, pipeline
from app.core.postprocess import vote
from app.models.schemas import (
    PlateBox,
    PlateCandidate,
    ReadBase64Request,
    ReadResponse,
    VoteCandidate,
    VoteResponse,
)

logger = logging.getLogger("anpr_backend.routes")

router = APIRouter(prefix="/anpr", tags=["ANPR"])


async def _decode(upload: UploadFile) -> np.ndarray:
    """
    Read an uploaded image into a BGR array.

    The size limit is enforced on the decoded bytes rather than the declared
    Content-Length, which a client controls and can simply lie about.
    """
    return _decode_bytes(await upload.read(), upload.filename or "image")


def _decode_bytes(raw: bytes, label: str = "image") -> np.ndarray:
    """Decode raw JPEG/PNG bytes into a BGR array, enforcing the size limit."""
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{label}' is empty",
        )

    if len(raw) > settings.max_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Image is larger than the {settings.MAX_IMAGE_SIZE_MB} MB limit. "
                "Capture at a lower resolution - plate reading does not benefit from "
                "more than about 1080p, and the upload time is what the officer feels."
            ),
        )

    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not decode that image. Send a JPEG or PNG.",
        )

    return image


def _save_crop(image: np.ndarray, detection: Detection) -> None:
    """
    Write the plate crop to disk when SAVE_CROPS is on.

    This is the training-data tap. The plates that matter for fine-tuning are the ones
    this campus's gates actually see - at this angle, in this light, with these local
    plate styles - and they only exist as a dataset if something saved them while the
    system was in use. Off by default: it writes images of real vehicles.
    """
    if not settings.SAVE_CROPS:
        return

    try:
        directory = settings.crop_storage_abs_path / datetime.now().strftime("%Y-%m-%d")
        directory.mkdir(parents=True, exist_ok=True)

        x1, y1, x2, y2 = detection.box
        crop = image[max(y1, 0) : y2, max(x1, 0) : x2]

        if crop.size == 0:
            return

        # The filename carries the read and its confidence, so a directory of crops can be
        # triaged by eye - and sorted by confidence - without any accompanying metadata.
        label = detection.reading.plate or "unread"
        name = f"{label}_{detection.reading.confidence:.2f}_{uuid.uuid4().hex[:8]}.jpg"
        cv2.imwrite(str(directory / name), crop)
    except Exception as error:  # pragma: no cover - never fail a read over a debug write
        logger.warning("Could not save crop: %s", error)


def _to_candidate(detection: Detection) -> PlateCandidate:
    reading = detection.reading

    return PlateCandidate(
        plate=reading.plate,
        display=reading.display,
        raw=reading.raw,
        confidence=round(reading.confidence, 4),
        detection_confidence=round(detection.detection_confidence, 4),
        char_confidences=(
            [round(value, 4) for value in detection.char_confidences]
            if detection.char_confidences
            else None
        ),
        format_valid=reading.format_valid,
        format_name=reading.format_name,
        corrected=reading.corrected,
        low_confidence=reading.confidence < settings.OCR_MIN_CONFIDENCE,
        box=PlateBox(x1=detection.box[0], y1=detection.box[1], x2=detection.box[2], y2=detection.box[3]),
    )


def _read_frame(frame: np.ndarray) -> ReadResponse:
    """Detect and read every plate in one decoded frame. Shared by both single-image routes."""
    started = time.perf_counter()
    try:
        detections = pipeline.read(frame)
    except Exception as error:
        logger.exception("Plate reading failed")
        # The cause is in the log above; the gate device only needs to know it failed.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Plate recognition failed. Type the plate in by hand.",
        ) from error

    elapsed_ms = (time.perf_counter() - started) * 1000

    for detection in detections:
        _save_crop(frame, detection)

    candidates = [_to_candidate(detection) for detection in detections]
    readable = [candidate for candidate in candidates if candidate.plate]

    # "No plate in the frame" and "a plate that could not be read" are different problems
    # with different fixes, and the message says which one happened.
    if not candidates:
        message = "No number plate found in the frame. Point the camera at the plate."
    elif not readable:
        message = "A plate was found but could not be read. Move closer or reduce glare."
    else:
        message = None

    return ReadResponse(
        success=bool(readable),
        best=readable[0] if readable else None,
        plates=candidates,
        processing_ms=round(elapsed_ms, 2),
        provider=pipeline.provider,
        message=message,
    )


@router.post("/read", response_model=ReadResponse, summary="Read plates in one image (file upload)")
async def read_plate(image: UploadFile = File(..., description="JPEG or PNG frame")) -> ReadResponse:
    """Detect and read every number plate in a single uploaded image."""
    return _read_frame(await _decode(image))


@router.post(
    "/read-base64",
    response_model=ReadResponse,
    summary="Read plates in one image (base64 JSON) - used by the mobile app",
)
async def read_plate_base64(body: ReadBase64Request) -> ReadResponse:
    """
    Detect and read every number plate in a single base64-encoded image.

    Accepts plain base64 or a data URI (`data:image/jpeg;base64,...`), since that is what
    image libraries on the phone produce.
    """
    encoded = body.image.strip()
    if encoded.startswith("data:"):
        encoded = encoded.split(",", 1)[-1]

    # Refuse an oversized body before decoding it, rather than after allocating it twice.
    # base64 is 4 characters per 3 bytes.
    if len(encoded) > settings.max_image_bytes * 4 // 3 + 4:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image is larger than the {settings.MAX_IMAGE_SIZE_MB} MB limit.",
        )

    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The image is not valid base64",
        ) from error

    return _read_frame(_decode_bytes(raw))


@router.post(
    "/read-frames",
    response_model=VoteResponse,
    summary="Read several frames of one vehicle and majority-vote the plate",
)
async def read_frames(
    images: List[UploadFile] = File(..., description="2-8 frames of the same vehicle"),
) -> VoteResponse:
    """
    Read the same vehicle across several frames and vote on the answer.

    Frames beyond MAX_VOTE_FRAMES are ignored rather than rejected: a client that sends
    twelve frames should get a good answer from the first eight, not an error. Each frame
    contributes only its largest plate, since the vote is about one vehicle - counting a
    car queued behind it would split the vote between two correct answers.
    """
    if len(images) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Send at least 2 frames, or use /read for a single image",
        )

    frames = images[: settings.MAX_VOTE_FRAMES]

    started = time.perf_counter()
    readings = []
    decoded_count = 0

    for upload in frames:
        try:
            frame = await _decode(upload)
        except HTTPException:
            # One unreadable frame out of eight is not a failed scan. Skipping it and
            # voting on the rest is what the officer wants; a 400 is not.
            continue

        decoded_count += 1

        try:
            best = pipeline.read_best(frame)
        except Exception:
            logger.exception("Plate reading failed on one frame of a vote batch")
            continue

        if best is not None:
            _save_crop(frame, best)
            if best.reading.plate:
                readings.append(best.reading)

    elapsed_ms = (time.perf_counter() - started) * 1000

    if decoded_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="None of the submitted frames could be decoded",
        )

    result = vote(readings)

    if result is None:
        return VoteResponse(
            success=False,
            frames_submitted=decoded_count,
            frames_with_reads=0,
            processing_ms=round(elapsed_ms, 2),
            provider=pipeline.provider,
            message="No plate could be read in any frame. Move closer and hold steady.",
        )

    return VoteResponse(
        success=True,
        plate=result.plate,
        display=result.display,
        confidence=round(result.confidence, 4),
        format_valid=result.format_valid,
        votes=result.votes,
        frames_submitted=decoded_count,
        frames_with_reads=result.frames_with_reads,
        candidates=[VoteCandidate(**candidate) for candidate in result.candidates],
        processing_ms=round(elapsed_ms, 2),
        provider=pipeline.provider,
        message=(
            # A bare majority across few frames is a weak result even when the winner is a
            # legal plate, and the officer should be told so rather than shown a number.
            "Frames disagreed - check the plate before saving"
            if result.votes < max(2, result.frames_with_reads // 2 + 1)
            else None
        ),
    )
