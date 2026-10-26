"""
VISION ANPR Backend - Configuration

All settings come from environment variables, with a .env file for local development.
Mirrors the Biometric_Backend's pattern so the two Python services are configured the
same way and neither needs its own explanation.
"""

from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- Server ---
    HOST: str = "0.0.0.0"
    # 8001 is the biometric service. This one takes the next port so both can run at once,
    # which they must: the gate screen calls face matching and plate reading in one flow.
    PORT: int = 8002
    DEBUG: bool = True

    # --- Detection ---
    # The plate detector. fast-alpr ships several YOLO variants as ONNX; the v9-t 384px
    # model is the default because it is the smallest one that still handles the angled,
    # partially-occluded plates you get from a phone held at a gate, and it runs in a few
    # milliseconds on an RTX 4060.
    DETECTOR_MODEL: str = "yolo-v9-t-384-license-plate-end2end"

    # Below this, a detection is discarded before OCR ever sees it. Deliberately low:
    # a missed plate costs a retry, while a spurious crop costs one bad OCR string that
    # the format check then rejects anyway.
    DETECTOR_CONFIDENCE: float = 0.35

    # --- Recognition ---
    # fast-plate-ocr's model. cct-s-v2 is the accuracy-leaning variant; cct-xs-v2 is
    # roughly twice as fast and a little worse on dirty plates. Both are tiny.
    OCR_MODEL: str = "cct-s-v2-global-model"

    # A per-plate mean character confidence below this is reported but flagged as
    # low-confidence, so the gate app pre-selects the field for the officer to correct
    # rather than quietly presenting a guess as fact.
    OCR_MIN_CONFIDENCE: float = 0.60

    # --- Fine-tuned models ---
    # Set these to run a model you trained yourself (scripts/finetune_ocr.py and
    # scripts/finetune_detector.py) instead of the hub's. Leaving them empty uses the
    # pre-trained models named above, which is the right default: the shipped models are
    # good, and a local fine-tune is only an improvement once it has been measured
    # against them on the same labelled set.
    OCR_MODEL_PATH: str = ""
    OCR_CONFIG_PATH: str = ""
    DETECTOR_MODEL_PATH: str = ""

    # --- Hardware ---
    # "auto" picks CUDA when onnxruntime-gpu can see a device and falls back to CPU
    # otherwise. Forcing "cpu" is useful for reproducing a result a machine without a GPU
    # produced.
    DEVICE: str = "auto"

    # --- Country / format post-processing ---
    # Applies the Indian plate grammar in postprocess.py. Set to "" to disable format
    # validation entirely (the raw OCR string is still returned either way).
    PLATE_COUNTRY: str = "IN"

    # --- Temporal voting ---
    # How many frames the batch endpoint will accept in one call. More frames means a more
    # reliable vote and a longer wait; 8 is roughly a second of video at a usable rate.
    MAX_VOTE_FRAMES: int = 8

    # --- Upload limits ---
    MAX_IMAGE_SIZE_MB: int = 10

    # --- Storage ---
    # Model weights directory - where YOLO and OCR models are downloaded
    WEIGHTS_DIR: str = "weights"
    
    # Where crops are written when SAVE_CROPS is on. This is a training-data tap: the
    # plates the model struggled with in real use are exactly the ones worth fine-tuning
    # on, and they only exist if something saved them.
    SAVE_CROPS: bool = False
    CROP_STORAGE_PATH: str = "data/crops"

    # --- CORS ---
    # Browser origins allowed to call this service. Empty: none. The app is native and
    # needs no CORS; "*" would let any web page on the campus network use the GPU.
    CORS_ORIGINS: str = ""

    @field_validator("DEVICE")
    @classmethod
    def validate_device(cls, value: str) -> str:
        allowed = {"auto", "cuda", "cpu"}
        if value not in allowed:
            raise ValueError(f"DEVICE must be one of {sorted(allowed)}, got '{value}'")
        return value

    @property
    def cors_origin_list(self) -> List[str]:
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def weights_dir_abs_path(self) -> Path:
        path = Path(self.WEIGHTS_DIR)
        return path if path.is_absolute() else BACKEND_DIR / path

    @property
    def crop_storage_abs_path(self) -> Path:
        path = Path(self.CROP_STORAGE_PATH)
        return path if path.is_absolute() else BACKEND_DIR / path

    @property
    def max_image_bytes(self) -> int:
        return self.MAX_IMAGE_SIZE_MB * 1024 * 1024

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
