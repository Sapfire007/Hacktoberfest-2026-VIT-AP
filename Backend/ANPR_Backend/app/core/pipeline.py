"""
The ANPR pipeline: plate detection, then character recognition.

ANPR is never one model. It is two, and conflating them is the usual reason a
from-scratch attempt performs badly:

1. **Detection** - find the plate in the frame and crop it. This is an object-detection
   problem, not a text-detection one. A general text detector fires on the dealer sticker,
   the model badge, the state emblem and the road sign behind the car; a detector trained
   specifically on plates does not.

2. **Recognition** - read the characters out of that crop. General-purpose document OCR
   (Tesseract) is trained on paragraphs of prose in document fonts and is weak on short,
   high-contrast, condensed-font alphanumeric strings photographed at an angle. A
   recogniser trained on plate crops is both smaller and better at exactly this.

This module wraps `fast-alpr`, which packages an MIT-licensed YOLO plate detector with
`fast-plate-ocr`'s purpose-built recogniser. Both ship as ONNX, so there is no PyTorch or
TensorFlow in this service at all - which is also why it gets its own virtual environment
rather than sharing the biometric service's, where TensorFlow pins CUDA libraries to
versions onnxruntime-gpu does not want.

The models are loaded lazily and held for the process lifetime. Loading them costs a few
seconds and a few hundred megabytes; doing it per request would make the gate unusable.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

from app.config import settings
from app.core.postprocess import PlateReading, post_process

logger = logging.getLogger("anpr_backend.pipeline")


@dataclass
class Detection:
    """One detected plate, read."""

    reading: PlateReading
    #: Pixel box in the source frame: (x1, y1, x2, y2). The app draws this over the
    #: preview so the officer can see *which* vehicle was read when two are in shot.
    box: Tuple[int, int, int, int]
    #: The detector's confidence that this box is a plate, distinct from the recogniser's
    #: confidence in the characters. A high detection score with a low OCR score means the
    #: plate was found but is unreadable - move closer - which is different advice from a
    #: low detection score, which means point the camera at the plate.
    detection_confidence: float
    #: Per-character recogniser confidence, when the model reports it. This is what makes
    #: "the 4th character is a guess" possible in the UI, rather than a single number for
    #: the whole string - and a single weak character is the normal failure, not a
    #: uniformly bad read.
    char_confidences: Optional[List[float]] = None


def _mean_confidence(confidence) -> Tuple[float, Optional[List[float]]]:
    """
    fast-plate-ocr reports either one confidence for the string or one per character,
    depending on the model. Collapse to a mean for ranking, but keep the per-character
    list when there is one.
    """
    if isinstance(confidence, (list, tuple)):
        values = [float(value) for value in confidence]
        if not values:
            return 0.0, None
        return sum(values) / len(values), values

    return float(confidence), None


class ANPRPipeline:
    """
    Detector plus recogniser, loaded once.

    Thread-safe by a coarse lock around inference. ONNX Runtime sessions are not
    guaranteed re-entrant across providers, and a gate handles a handful of requests a
    minute - the lock costs nothing here and removes a whole class of intermittent
    crash that would only ever appear under load, in production, at a gate.
    """

    def __init__(self) -> None:
        self._alpr = None
        self._lock = threading.Lock()
        self._load_lock = threading.Lock()
        self._provider: Optional[str] = None

    # -- loading ------------------------------------------------------------------

    def _resolve_providers(self) -> List[str]:
        """
        Decide which ONNX Runtime execution providers to ask for.

        Asking for CUDA when it is unavailable makes onnxruntime print a long warning and
        silently fall back, which reads like a crash in the logs and then confuses the
        benchmark numbers. Checking first means the log says plainly which one is in use.
        """
        if settings.DEVICE == "cpu":
            return ["CPUExecutionProvider"]

        try:
            import onnxruntime as ort

            available = ort.get_available_providers()
        except Exception as error:  # pragma: no cover - import-time environment problem
            logger.warning("Could not query onnxruntime providers (%s); using CPU", error)
            return ["CPUExecutionProvider"]

        if "CUDAExecutionProvider" in available:
            return ["CUDAExecutionProvider", "CPUExecutionProvider"]

        if settings.DEVICE == "cuda":
            logger.error(
                "DEVICE=cuda was requested but CUDAExecutionProvider is not available. "
                "Available providers: %s. Install onnxruntime-gpu and check that the "
                "CUDA and cuDNN versions match it (see scripts/check_gpu.py).",
                available,
            )

        return ["CPUExecutionProvider"]

    def load(self) -> None:
        """Load the models. Safe to call repeatedly; only the first call does work."""
        if self._alpr is not None:
            return

        with self._load_lock:
            if self._alpr is not None:
                return

            from fast_alpr import ALPR

            providers = self._resolve_providers()
            self._provider = providers[0]

            started = time.perf_counter()

            # A locally fine-tuned recogniser replaces the hub model entirely: fast-alpr
            # wants `ocr_model=None` when explicit paths are given, and passing both would
            # silently use the hub one and make the fine-tune look like it did nothing.
            use_local_ocr = bool(settings.OCR_MODEL_PATH and settings.OCR_CONFIG_PATH)

            self._alpr = ALPR(
                detector_model=settings.DETECTOR_MODEL,
                detector_conf_thresh=settings.DETECTOR_CONFIDENCE,
                detector_providers=providers,
                ocr_model=None if use_local_ocr else settings.OCR_MODEL,
                ocr_model_path=settings.OCR_MODEL_PATH or None,
                ocr_config_path=settings.OCR_CONFIG_PATH or None,
                ocr_providers=providers,
            )

            logger.info(
                "ANPR models loaded in %.2fs | detector=%s | ocr=%s | provider=%s",
                time.perf_counter() - started,
                settings.DETECTOR_MODEL,
                settings.OCR_MODEL_PATH if use_local_ocr else settings.OCR_MODEL,
                self._provider,
            )

    @property
    def is_loaded(self) -> bool:
        return self._alpr is not None

    @property
    def provider(self) -> Optional[str]:
        return self._provider

    # -- inference ----------------------------------------------------------------

    def read(self, image: np.ndarray) -> List[Detection]:
        """
        Detect and read every plate in one BGR frame.

        Returns detections ordered by plate area, largest first. At a gate the plate that
        fills most of the frame is the vehicle at the barrier; a smaller one is the car
        queued behind it, and reading that one instead would admit the wrong vehicle.
        """
        self.load()

        with self._lock:
            results = self._alpr.predict(image)

        detections: List[Detection] = []

        for result in results:
            box = result.detection.bounding_box
            coordinates = (int(box.x1), int(box.y1), int(box.x2), int(box.y2))

            # A detection with no readable text still happened - the plate is there and
            # the officer should be told "found it, cannot read it" rather than nothing.
            if result.ocr is None:
                reading = post_process("", 0.0, settings.PLATE_COUNTRY)
                char_confidences = None
            else:
                confidence, char_confidences = _mean_confidence(result.ocr.confidence)
                reading = post_process(result.ocr.text, confidence, settings.PLATE_COUNTRY)

            detections.append(
                Detection(
                    reading=reading,
                    box=coordinates,
                    detection_confidence=float(result.detection.confidence),
                    char_confidences=char_confidences,
                )
            )

        detections.sort(
            key=lambda detection: (detection.box[2] - detection.box[0])
            * (detection.box[3] - detection.box[1]),
            reverse=True,
        )

        return detections

    def read_best(self, image: np.ndarray) -> Optional[Detection]:
        """The largest plate in the frame, or None if there wasn't one."""
        detections = self.read(image)
        return detections[0] if detections else None


#: Process-wide instance. FastAPI's lifespan handler warms it at startup so the first
#: officer of the shift does not pay the load time while a car waits at the barrier.
pipeline = ANPRPipeline()
