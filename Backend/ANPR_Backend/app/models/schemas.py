"""
Request and response schemas for the ANPR service.

The response deliberately carries more than a plate string. An officer needs to know not
just what the model read but how much to trust it: whether the string is a legal Indian
plate, whether post-processing changed it, and whether the failure was "no plate in
frame" or "plate found, unreadable". Those lead to different actions - retype it, move
closer, point the camera elsewhere - and a bare string cannot distinguish them.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class PlateBox(BaseModel):
    """Where the plate sits in the submitted frame, in source pixels."""

    x1: int
    y1: int
    x2: int
    y2: int


class PlateCandidate(BaseModel):
    """One plate found in one frame."""

    plate: str = Field(description="Normalised, confusion-corrected. The form to store.")
    display: str = Field(description='Conventionally spaced, e.g. "AP 31 AB 1234".')
    raw: str = Field(description="What the recogniser emitted, before any correction.")

    confidence: float = Field(ge=0.0, le=1.0, description="Mean character confidence.")
    detection_confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence that this box is a plate at all."
    )
    char_confidences: Optional[List[float]] = Field(
        default=None, description="Per-character confidence, where the model reports it."
    )

    format_valid: bool = Field(description="Matches a known Indian plate grammar.")
    format_name: Optional[str] = Field(
        default=None, description="civilian | bharat | civilian_unknown_state | null"
    )
    corrected: bool = Field(
        description="Confusion correction changed the string. Worth surfacing to the officer."
    )
    low_confidence: bool = Field(
        description="Below the configured threshold. The app should pre-select the field for editing."
    )

    box: PlateBox


class ReadBase64Request(BaseModel):
    """
    One image as base64, for clients that cannot send multipart files.

    Expo SDK 57's `fetch` rejects React Native's `{ uri, name, type }` form-data parts, so
    the mobile app sends the photo inline. A 1280px JPEG is roughly 150-300 KB, about a
    third larger once encoded - small enough that the encoding overhead is irrelevant.
    """

    image: str = Field(
        min_length=16,
        description="JPEG or PNG as base64, optionally as a data URI (data:image/jpeg;base64,...)",
    )


class ReadResponse(BaseModel):
    """Result of reading a single frame."""

    success: bool
    #: The largest plate in the frame - the vehicle at the barrier, not the one queued
    #: behind it. Null when nothing was detected.
    best: Optional[PlateCandidate] = None
    #: Everything found, largest first. The app shows this when two vehicles are in shot
    #: so the officer picks rather than the server guessing.
    plates: List[PlateCandidate] = Field(default_factory=list)
    processing_ms: float
    #: "CUDAExecutionProvider" or "CPUExecutionProvider". Present so a slow gate can be
    #: diagnosed from a response rather than by reading server logs.
    provider: Optional[str] = None
    message: Optional[str] = None


class VoteCandidate(BaseModel):
    plate: str
    display: str
    votes: int
    confidence: float
    format_valid: bool


class VoteResponse(BaseModel):
    """
    Result of reading several frames of the same vehicle and majority-voting them.

    This is the endpoint the gate camera should use. A single frame's read is good;
    agreement across frames whose blur, glare and angle all differ is much better, and the
    frames were being captured anyway.
    """

    success: bool
    plate: Optional[str] = None
    display: Optional[str] = None
    confidence: float = 0.0
    format_valid: bool = False

    votes: int = 0
    frames_submitted: int = 0
    frames_with_reads: int = 0
    #: Every distinct plate seen and how often. A near-tie is visible here, and a near-tie
    #: is exactly when the officer should look at the car rather than the screen.
    candidates: List[VoteCandidate] = Field(default_factory=list)

    processing_ms: float = 0.0
    provider: Optional[str] = None
    message: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    models_loaded: bool
    provider: Optional[str] = None
    detector_model: str
    ocr_model: str
