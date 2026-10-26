"""
VISION Biometric Backend — Face Engine

Central wrapper for face detection, embedding extraction, and embedding comparison.
Uses DeepFace with the configured recognition model and detector backend.
"""

import io
import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# DeepFace is imported lazily to avoid heavy TensorFlow import at module load time.
_deepface = None
_deepface_failed = False


def _get_deepface():
    """Lazily import DeepFace if available."""
    global _deepface, _deepface_failed
    if _deepface_failed:
        return None
    if _deepface is None:
        try:
            logger.info("Attempting to load DeepFace library...")
            from deepface import DeepFace
            _deepface = DeepFace
            logger.info("DeepFace loaded successfully.")
        except Exception as e:
            logger.error(f"DeepFace not available ({e}).")
            _deepface_failed = True
            return None
    return _deepface


class FaceEngineError(Exception):
    """Raised when face processing fails."""
    pass


class FaceEngine:
    """
    Facial recognition engine.

    Handles:
    1. Face detection with quality checks and anti-spoofing
    2. Embedding extraction (facial vector representation)
    3. Embedding comparison (cosine/euclidean distance)
    """

    def __init__(
        self,
        model_name: str = "VGG-Face",
        detector_backend: str = "retinaface",
        distance_metric: str = "cosine",
        verification_threshold: float = 0.40,
        min_face_confidence: float = 0.90,
        anti_spoofing: bool = True,
    ):
        self.model_name = model_name
        self.detector_backend = detector_backend
        self.distance_metric = distance_metric
        self.verification_threshold = verification_threshold
        self.min_face_confidence = min_face_confidence
        self.anti_spoofing = anti_spoofing
        self._model_loaded = False

        logger.info(
            f"FaceEngine initialized: model={model_name}, "
            f"detector={detector_backend}, metric={distance_metric}, "
            f"threshold={verification_threshold}, anti_spoofing={anti_spoofing}"
        )

    def _warm_up_model(self) -> None:
        """Pre-load recognition model weights."""
        if self._model_loaded:
            return

        DeepFace = _get_deepface()
        if DeepFace is None:
            raise FaceEngineError(
                "DeepFace is required for biometric processing. Install deepface "
                "and a TensorFlow-compatible Python runtime (3.11 is recommended)."
            )

        try:
            dummy_img = np.zeros((224, 224, 3), dtype=np.uint8)
            DeepFace.represent(
                img_path=dummy_img,
                model_name=self.model_name,
                detector_backend="skip",
                enforce_detection=False,
            )
            self._model_loaded = True
        except Exception as e:
            raise FaceEngineError(f"DeepFace model warmup failed: {e}") from e

    def _image_bytes_to_numpy(self, image_bytes: bytes) -> np.ndarray:
        """Convert raw image bytes to RGB numpy array."""
        try:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != "RGB":
                img = img.convert("RGB")
            return np.array(img)
        except Exception as e:
            raise FaceEngineError(f"Failed to decode image: {e}")

    def detect_and_validate(self, image_bytes: bytes) -> List[Dict]:
        """Detect faces in an image with quality and liveness checks."""
        img_array = self._image_bytes_to_numpy(image_bytes)
        DeepFace = _get_deepface()

        if DeepFace is None:
            raise FaceEngineError(
                "DeepFace is not available. Install deepface and TensorFlow in the "
                "Python 3.11 virtual environment before using this backend."
            )

        try:
            face_objs = DeepFace.extract_faces(
                img_path=img_array,
                detector_backend=self.detector_backend,
                enforce_detection=True,
                align=True,
                anti_spoofing=self.anti_spoofing,
            )
            return face_objs
        except ValueError as e:
            if "no face" in str(e).lower() or "could not" in str(e).lower():
                return []
            raise FaceEngineError(f"DeepFace face detection failed: {e}") from e
        except Exception as e:
            raise FaceEngineError(f"DeepFace face detection failed: {e}") from e

    def generate_embedding(
        self,
        image_bytes: bytes,
        face_result: Optional[Dict] = None,
    ) -> List[float]:
        """Generate a facial embedding vector from an image or detected face crop."""
        self._warm_up_model()
        img_array = self._image_bytes_to_numpy(image_bytes)
        DeepFace = _get_deepface()

        if DeepFace is None:
            raise FaceEngineError(
                "DeepFace is not available. Install deepface and TensorFlow in the "
                "Python 3.11 virtual environment before using this backend."
            )

        try:
            if face_result is not None and face_result.get("face") is not None:
                face_image = face_result["face"]
                embedding_objs = DeepFace.represent(
                    img_path=face_image,
                    model_name=self.model_name,
                    detector_backend="skip",
                    enforce_detection=False,
                    align=False,
                )
            else:
                embedding_objs = DeepFace.represent(
                    img_path=img_array,
                    model_name=self.model_name,
                    detector_backend=self.detector_backend,
                    enforce_detection=True,
                    align=True,
                )

            if isinstance(embedding_objs, list) and embedding_objs:
                return embedding_objs[0]["embedding"]
            if isinstance(embedding_objs, dict) and "embedding" in embedding_objs:
                return embedding_objs["embedding"]

            raise FaceEngineError("DeepFace returned no embeddings")
        except Exception as e:
            raise FaceEngineError(f"DeepFace embedding generation failed: {e}") from e

    def compute_composite_embedding(self, embeddings: List[List[float]]) -> List[float]:
        """Compute average L2-normalized embedding vector from multi-angle captures."""
        if not embeddings:
            raise FaceEngineError("No embeddings to average")

        dims = set(len(e) for e in embeddings)
        if len(dims) > 1:
            raise FaceEngineError(f"Embedding dimension mismatch: {dims}")

        matrix = np.array(embeddings, dtype=np.float64)
        composite = np.mean(matrix, axis=0)
        norm = np.linalg.norm(composite)
        if norm > 0:
            composite = composite / norm

        return composite.tolist()

    def compare_embeddings(
        self,
        embedding1: List[float],
        embedding2: List[float],
        threshold: Optional[float] = None,
    ) -> Tuple[float, bool, float]:
        """Compare two embedding vectors using cosine distance."""
        if threshold is None:
            threshold = self.verification_threshold

        vec1 = np.array(embedding1, dtype=np.float64)
        vec2 = np.array(embedding2, dtype=np.float64)

        if len(vec1) != len(vec2):
            raise FaceEngineError(f"Embedding dimension mismatch: {len(vec1)} vs {len(vec2)}")

        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            distance = 1.0
        else:
            cosine_sim = dot_product / (norm1 * norm2)
            distance = float(1.0 - cosine_sim)

        is_match = distance <= threshold
        confidence_score = max(0.0, min(1.0, 1.0 - (distance / threshold))) if threshold > 0 else 1.0

        return (round(distance, 6), is_match, round(confidence_score, 4))

    def get_model_info(self) -> Dict:
        return {
            "engine": "DeepFace",
            "model_name": self.model_name,
            "detector_backend": self.detector_backend,
            "distance_metric": self.distance_metric,
            "verification_threshold": self.verification_threshold,
            "min_face_confidence": self.min_face_confidence,
            "anti_spoofing_enabled": self.anti_spoofing,
            "model_loaded": self._model_loaded,
        }
