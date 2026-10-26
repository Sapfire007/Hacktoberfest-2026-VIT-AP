"""
Fine-tune the plate *detector* on VIT-AP gate imagery.

This is the second thing to try, not the first. Detection and recognition fail
differently, and the benchmark tells you which one you have:

    high detection rate, wrong characters  ->  the OCR is the problem (finetune_ocr.py)
    low detection rate                     ->  the detector is the problem (this script)

"Low detection rate" means the model is not finding plates that are clearly in frame. The
shipped YOLOv9-t is trained across 65+ countries and is rarely the weak link, but it can
be at a specific gate: an unusual camera height, heavy backlighting at a particular hour,
a barrier that clips the plate, or motorcycle plates mounted at an angle no dataset
covers well.

You need bounding boxes, not just plate strings, which is a different and slower
annotation job than the OCR one. Budget for it: around 500-1,000 annotated frames is
enough for a detector fine-tune, because you are adapting a model rather than teaching it
what a plate is.

Annotating: use Label Studio or CVAT locally, or Roboflow if you are comfortable with the
images leaving the campus network - they are photographs of identifiable vehicles, so that
is a real decision and not a formality. Export in YOLO format.

Expected layout (standard Ultralytics):

    data/detector/
      data.yaml
      train/images/*.jpg   train/labels/*.txt
      val/images/*.jpg     val/labels/*.txt

Prerequisite:

    pip install ultralytics

Usage:

    python scripts/finetune_detector.py --data data/detector/data.yaml
    python scripts/finetune_detector.py --data data/detector/data.yaml --epochs 100 --imgsz 640
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def write_data_yaml_template(path: Path) -> None:
    """Write a data.yaml the user can fill in, rather than making them look up the format."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "# Ultralytics dataset definition for the VISION plate detector.\n"
        "# Paths are relative to this file.\n"
        "\n"
        "path: .\n"
        "train: train/images\n"
        "val: val/images\n"
        "\n"
        "# One class. The detector's whole job is 'is this a number plate', and adding\n"
        "# classes for vehicle types would spend capacity on something the gate does not\n"
        "# need and the OCR stage cannot use.\n"
        "names:\n"
        "  0: license_plate\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Fine-tune the plate detector")
    parser.add_argument("--data", default="data/detector/data.yaml", help="Ultralytics data.yaml")
    parser.add_argument(
        "--weights",
        default="yolov9t.pt",
        help=(
            "Starting weights. yolov9t is the architecture the shipped ONNX detector uses, "
            "so a fine-tune from it drops into the same inference path."
        ),
    )
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument(
        "--imgsz",
        type=int,
        default=384,
        help=(
            "Must match the DETECTOR_MODEL you intend to replace. Training at 640 and "
            "serving a 384 model throws away exactly the small-plate recall you trained for."
        ),
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=16,
        help="16 at 384px fits the 4060's 8GB with room to spare. Raise until it OOMs, then back off.",
    )
    parser.add_argument("--project", default="data/runs", help="Where Ultralytics writes runs")
    parser.add_argument("--name", default="plate-detector")
    parser.add_argument("--init-config", action="store_true", help="Write a data.yaml template and exit")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.is_absolute():
        data_path = BACKEND_DIR / data_path

    if args.init_config:
        write_data_yaml_template(data_path)
        print(f"Wrote a template to {data_path}")
        print("Fill in your annotated train/ and val/ directories, then run this again.")
        return 0

    if not data_path.is_file():
        print(f"No data.yaml at {data_path}")
        print("Run with --init-config to write a template.")
        return 1

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ultralytics is not installed.\n  pip install ultralytics")
        return 1

    import torch

    if not torch.cuda.is_available():
        # Detector training on CPU is not slow, it is impractical - days rather than the
        # hour this takes on the 4060. Better to stop than to let it start.
        print("No CUDA device visible to PyTorch. Detector training needs the GPU.")
        print("Install a CUDA build of PyTorch: https://pytorch.org/get-started/locally/")
        return 1

    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Weights: {args.weights} | imgsz={args.imgsz} | batch={args.batch}\n")

    model = YOLO(args.weights)

    model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        project=str(BACKEND_DIR / args.project),
        name=args.name,
        # Mixed precision. Roughly halves the time on Ada cards with no measurable
        # accuracy cost for a detector this size.
        amp=True,
        # Stop when validation mAP stops improving. On a small fine-tuning set the model
        # starts memorising well before the epoch budget runs out, and the extra epochs
        # actively cost you generalisation.
        patience=25,
        # Colour augmentation matters more than usual here: the failure this fine-tune is
        # usually fixing is one lighting condition at one time of day, and hue/saturation
        # jitter is what stops the model overfitting to the rest of them.
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        # Plates are never upside down and rarely mirrored. Flipping teaches the model
        # that mirrored text is a plate, which costs recall for nothing.
        fliplr=0.0,
        flipud=0.0,
        degrees=8.0,
    )

    run_dir = BACKEND_DIR / args.project / args.name
    best = run_dir / "weights" / "best.pt"

    print(f"\nBest weights: {best}")
    print("\nExport to ONNX so the service can load it:\n")
    print(f"  yolo export model={best} format=onnx imgsz={args.imgsz} simplify=True")
    print("\nThen point the service at it in .env:\n")
    print(f"  DETECTOR_MODEL_PATH={run_dir / 'weights' / 'best.onnx'}")
    print("\nAnd re-run scripts/benchmark.py against the same labelled set as before.\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
