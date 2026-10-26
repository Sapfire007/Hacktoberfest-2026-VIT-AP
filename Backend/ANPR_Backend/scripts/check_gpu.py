"""
Verify the ANPR environment - GPU, models, and a real end-to-end read.

Run this straight after installing, before wiring the app to the service:

    venv_anpr\\Scripts\\activate
    python scripts/check_gpu.py

It checks four things in order, because each one only makes sense if the previous one
passed, and it prints what to do about each failure rather than just reporting it.

The most common failure by far is onnxruntime-gpu being installed but unable to load
CUDA - which does not raise. It prints a warning, falls back to CPU, and everything keeps
working about fifteen times slower. That silence is exactly what this script exists to
break.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Allow `python scripts/check_gpu.py` from the backend root without installing the package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

PASS = "[ OK ]"
FAIL = "[FAIL]"
WARN = "[WARN]"


def check_onnxruntime() -> bool:
    print("\n1. ONNX Runtime")
    print("   " + "-" * 60)

    try:
        import onnxruntime as ort
    except ImportError:
        print(f"   {FAIL} onnxruntime is not installed.")
        print("          pip install -r requirements.txt")
        return False

    providers = ort.get_available_providers()
    print(f"   {PASS} onnxruntime {ort.__version__}")
    print(f"          providers: {', '.join(providers)}")

    if "CUDAExecutionProvider" not in providers:
        from app.config import settings

        # Asked for the CPU, got the CPU. Nothing to warn about.
        if settings.DEVICE == "cpu":
            print(f"   {PASS} CPU build of ONNX Runtime, as configured (DEVICE=cpu).")
            return True

        print(f"   {WARN} No CUDAExecutionProvider - inference will run on the CPU.")
        print("          On an RTX 4060 that is roughly 15x slower than it needs to be.")
        print("          Fix: pip uninstall onnxruntime && pip install onnxruntime-gpu")
        print("          Then check the CUDA/cuDNN versions that build expects:")
        print("          https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html")
        return False

    return True


def check_cuda_actually_loads() -> bool:
    """
    Creating a trivial session with the CUDA provider and checking which provider it
    actually got.

    `get_available_providers()` lists what the build was compiled with, not what it can
    load right now. A mismatched cuDNN shows up as "available" and then silently falls
    back at session creation - so the only honest test is to create one and look.
    """
    print("\n2. CUDA actually loads")
    print("   " + "-" * 60)

    try:
        import onnx
        import onnxruntime as ort
        from onnx import TensorProto, helper
    except ImportError:
        print(f"   {WARN} Skipped - the 'onnx' package is not installed.")
        print("          pip install onnx   (only needed for this check)")
        return True

    try:
        node = helper.make_node("Relu", ["x"], ["y"])
        graph = helper.make_graph(
            [node],
            "probe",
            [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 8])],
            [helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 8])],
        )
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])

        session = ort.InferenceSession(
            model.SerializeToString(),
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )

        active = session.get_providers()[0]

        if active == "CUDAExecutionProvider":
            print(f"   {PASS} A CUDA session was created and is in use.")
            return True

        print(f"   {FAIL} CUDA was requested but the session fell back to {active}.")
        print("          This is the silent failure. onnxruntime-gpu is installed but")
        print("          cannot load its CUDA/cuDNN libraries.")
        print("          Check that the CUDA toolkit and cuDNN versions match the")
        print("          onnxruntime-gpu build, and that both are on PATH.")
        return False

    except Exception as error:
        print(f"   {FAIL} Could not create a CUDA session: {error}")
        return False


def check_models() -> bool:
    print("\n3. Model download and load")
    print("   " + "-" * 60)
    print("   The first run downloads the detector and OCR weights. Give it a minute.")

    from app.config import settings
    from app.core.pipeline import pipeline

    try:
        started = time.perf_counter()
        pipeline.load()
        elapsed = time.perf_counter() - started
    except Exception as error:
        print(f"   {FAIL} Models failed to load: {error}")
        return False

    print(f"   {PASS} Loaded in {elapsed:.1f}s")
    print(f"          detector : {settings.DETECTOR_MODEL}")
    print(f"          ocr      : {settings.OCR_MODEL}")
    print(f"          provider : {pipeline.provider}")

    if pipeline.provider != "CUDAExecutionProvider":
        print(f"   {WARN} Running on the CPU. Usable, but not what the 4060 is for.")

    return True


def check_inference(image_path: str | None) -> bool:
    """
    Run one real inference.

    With no image, a synthetic frame is used. That will find no plate, and that is the
    point - it proves the pipeline runs end to end without claiming anything about
    accuracy. Pass a real photo to see an actual read.
    """
    print("\n4. End-to-end inference")
    print("   " + "-" * 60)

    import cv2

    from app.core.pipeline import pipeline

    if image_path:
        frame = cv2.imread(image_path)
        if frame is None:
            print(f"   {FAIL} Could not read {image_path}")
            return False
        print(f"          image: {image_path}  {frame.shape[1]}x{frame.shape[0]}")
    else:
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        print("          image: synthetic blank frame (no plate expected)")

    try:
        # The first inference includes one-off kernel compilation and is not
        # representative, so it is run and discarded before the timed one.
        pipeline.read(frame)

        started = time.perf_counter()
        detections = pipeline.read(frame)
        elapsed_ms = (time.perf_counter() - started) * 1000
    except Exception as error:
        print(f"   {FAIL} Inference raised: {error}")
        return False

    print(f"   {PASS} Inference completed in {elapsed_ms:.1f} ms")

    if not detections:
        print("          no plates detected")
    for detection in detections:
        reading = detection.reading
        flag = "valid" if reading.format_valid else "UNRECOGNISED FORMAT"
        print(
            f"          {reading.display or '(unreadable)':<16} "
            f"conf={reading.confidence:.2f} det={detection.detection_confidence:.2f} [{flag}]"
        )
        if reading.corrected:
            print(f"            corrected from raw OCR: {reading.raw}")

    return True


def main() -> int:
    image_path = sys.argv[1] if len(sys.argv) > 1 else None

    print("=" * 68)
    print("VISION ANPR - environment check")
    print("=" * 68)
    print("Usage: python scripts/check_gpu.py [path/to/a/car/photo.jpg]")

    # A machine that has deliberately opted out of the GPU should not be told off for it.
    # DEVICE=cpu is a supported configuration, not a broken one, and reporting it as a
    # failure trains people to ignore this script's output — the opposite of its purpose.
    from app.config import settings

    cpu_by_choice = settings.DEVICE == "cpu"

    if cpu_by_choice:
        print("\n   NOTE  DEVICE=cpu is set, so the GPU checks below are skipped.")
        print("         This is supported — see 'Running without a GPU' in")
        print("         ANPR_backend_startup.md. Expect a few hundred milliseconds per")
        print("         frame rather than a few tens, which is still usable at a gate.")

    if not check_onnxruntime():
        print("\nStopped: fix the ONNX Runtime install before continuing.\n")
        return 1

    cuda_ok = True if cpu_by_choice else check_cuda_actually_loads()

    if not check_models():
        print("\nStopped: the models could not be loaded.\n")
        return 1

    if not check_inference(image_path):
        return 1

    print("\n" + "=" * 68)
    if cpu_by_choice:
        print("Ready, on the CPU by configuration. Start the service with:")
        print("  uvicorn app.main:app --host 0.0.0.0 --port 8002")
    elif cuda_ok:
        print("Ready. Start the service with:")
        print("  uvicorn app.main:app --host 0.0.0.0 --port 8002")
    else:
        # The distinction that matters: DEVICE=cpu is a decision, whereas falling back to
        # the CPU under DEVICE=auto is an accident nobody was told about.
        print("Ready, running on the CPU (DEVICE=auto found no usable GPU).")
        print("This works fine. If this machine has an NVIDIA GPU, fix the CUDA setup")
        print("above for faster reads.")
        print("  uvicorn app.main:app --host 0.0.0.0 --port 8002")
    print("=" * 68 + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
