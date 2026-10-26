"""
verify_ml_env.py

Helper script to verify DeepFace/TensorFlow availability for the Biometric Backend.
Run this inside your backend virtualenv to get actionable diagnostics and suggested pip commands.

Usage:
  python scripts/verify_ml_env.py
"""

import sys
import os
import platform
import traceback
from pathlib import Path

# Ensure weights stay inside Backend/Biometric_Backend
BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
os.environ["DEEPFACE_HOME"] = BACKEND_DIR
os.environ["PYTHONIOENCODING"] = "utf-8"

print("== VISION Biometric Backend ML Environment Check ==")
print(f"Python: {platform.python_version()} ({platform.system()}/{platform.machine()})")
print()

# Check OpenCV, which DeepFace still uses as a dependency
print("-- OpenCV dependency check --")
try:
    import cv2
    print(f"cv2 version: {getattr(cv2, '__version__', 'unknown')}")
    print("OpenCV import: OK")
except Exception:
    print("Failed to import cv2. Trace:")
    traceback.print_exc()
    print("Suggested fix: in your virtualenv run:\n  pip install opencv-python-headless numpy")

print()
# Check DeepFace availability
print("-- DeepFace / TensorFlow check --")
try:
    from deepface import DeepFace
    print("DeepFace import: OK")
    # Quick represent warmup using a dummy face crop (small black image)
    try:
        import numpy as np
        dummy = np.zeros((224, 224, 3), dtype=np.uint8)
        print("Running DeepFace.represent (this may download model weights on first run)...")
        rep = DeepFace.represent(img_path=dummy, model_name='VGG-Face', detector_backend='skip', enforce_detection=False)
        print("DeepFace.represent returned an embedding object; VGG-Face is available.")
    except Exception:
        print("DeepFace imported but represent() failed. Full traceback:")
        traceback.print_exc()
        print("If this is a TensorFlow error, ensure you have a TensorFlow build compatible with your Python version.")
except Exception:
    print("DeepFace not importable. Trace:")
    traceback.print_exc()
    print()
    print("DeepFace requires TensorFlow. Typical installation instructions (for Python 3.9-3.11):")
    print("  pip install tensorflow-cpu==2.13.* deepface==0.0.93")
    print("Note: TensorFlow currently does not support Python 3.14 in many builds. If you're on 3.14, create a 3.11 venv:")
    print("  python -m venv venv3.11")
    print("  venv3.11\\Scripts\\activate")
    print("  pip install -r requirements.txt")

print()
print("== Check complete ==")
print("If you need help installing packages, run the suggested pip commands above inside your virtualenv.")
