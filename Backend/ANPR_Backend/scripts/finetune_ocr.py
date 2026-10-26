"""
Fine-tune the plate OCR recogniser on VIT-AP gate data.

READ THIS FIRST: you probably do not need to fine-tune.

The shipped `cct-s-v2-global-model` is trained on plates from dozens of countries,
including India, and on a typical campus gate it reads 90-95% of plates exactly right
before any tuning. The remaining errors are usually fixable for free by the positional
confusion correction in `app/core/postprocess.py`, which costs no training at all.

Run `scripts/benchmark.py` with a labelled set **first**. Fine-tune only if:

  - exact-match accuracy is below about 90%, AND
  - the benchmark's confusion table shows errors in the *middle* of the plate (the
    district code and series), which positional correction cannot reach, AND
  - you have at least ~2,000 corrected real crops. Below roughly a thousand, fine-tuning
    a transformer recogniser reliably makes it worse on everything it was already good
    at while barely helping on your cases.

If you do have that, this is a genuinely fast job on an RTX 4060: the cct-s model is small
and the crops are 64px tall. Expect well under an hour.

Prerequisites:

    pip install fast-plate-ocr[train]

Dataset, from scripts/prepare_dataset.py:

    data/datasets/
      train/images/*.jpg  train/annotations.csv
      val/images/*.jpg    val/annotations.csv

Usage:

    python scripts/finetune_ocr.py --dataset data/datasets
    python scripts/finetune_ocr.py --dataset data/datasets --epochs 60 --batch-size 128
    python scripts/finetune_ocr.py --dataset data/datasets --print-only

This script prepares the plate-alphabet config, sanity-checks the dataset, and then
invokes the `fast_plate_ocr` training CLI. `--print-only` prints the command instead of
running it, for when you would rather drive the training yourself.
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BACKEND_DIR = Path(__file__).resolve().parent.parent

# The alphabet the model may emit. Restricting it to what Indian plates actually contain
# shrinks the output layer and removes whole classes of impossible prediction - the model
# cannot emit a character that no plate has.
PLATE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# Padding character. Plates vary from 8 to 11 characters, and a fixed-width model needs a
# symbol for "nothing here". It must not be a character that appears on a plate.
PAD_CHARACTER = "_"

# The longest Indian plate this model will handle: a Bharat-series plate is 10 characters
# (22BH1234AA), and 11 leaves room for the rare three-letter series.
MAX_PLATE_SLOTS = 11


def audit_dataset(dataset_dir: Path) -> tuple[bool, list[str]]:
    """
    Check the dataset before spending GPU time on it.

    Every failure here is one that produces a model that trains happily and then performs
    worse than the one it replaced - which is the expensive kind, because you only find out
    at the gate.
    """
    problems: list[str] = []
    character_counts: Counter[str] = Counter()
    length_counts: Counter[int] = Counter()

    for split in ("train", "val"):
        annotations = dataset_dir / split / "annotations.csv"

        if not annotations.is_file():
            problems.append(f"missing {annotations}")
            continue

        rows = 0
        with annotations.open(newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            next(reader, None)

            for row in reader:
                if len(row) < 2:
                    continue

                image_path, plate = row[0].strip(), row[1].strip().upper()
                rows += 1

                if not (dataset_dir / split / image_path).is_file():
                    problems.append(f"{split}: image not found - {image_path}")

                if len(plate) > MAX_PLATE_SLOTS:
                    problems.append(
                        f"{split}: '{plate}' is {len(plate)} characters, over the "
                        f"{MAX_PLATE_SLOTS}-slot limit"
                    )

                unknown = set(plate) - set(PLATE_ALPHABET)
                if unknown:
                    problems.append(f"{split}: '{plate}' contains {sorted(unknown)}")

                character_counts.update(plate)
                length_counts[len(plate)] += 1

        print(f"  {split:<6} {rows:>6} samples")

        if split == "train" and rows < 1000:
            problems.append(
                f"only {rows} training samples. Below about 1,000 a fine-tune usually "
                "degrades the model rather than improving it - collect more first."
            )

    if character_counts:
        print("\n  Character coverage:")
        rare = [char for char in PLATE_ALPHABET if character_counts[char] < 20]
        print(f"    {len(PLATE_ALPHABET) - len(rare)}/{len(PLATE_ALPHABET)} characters seen 20+ times")
        if rare:
            # A character the model barely sees in training is one it will read badly at
            # the gate, and it will do so confidently.
            print(f"    under-represented: {''.join(rare)}")
            print("    Those are the characters this fine-tune will be worst at.")

        print(f"\n  Plate lengths: {dict(sorted(length_counts.items()))}")

    return not problems, problems


def write_config(dataset_dir: Path) -> Path:
    """
    Write the plate-alphabet config fast-plate-ocr trains against.

    Kept next to the dataset rather than in the repository root, because it describes that
    dataset - a config that has drifted from the data it was written for is a silent
    source of garbage labels.
    """
    config = {
        "max_plate_slots": MAX_PLATE_SLOTS,
        "alphabet": PLATE_ALPHABET + PAD_CHARACTER,
        "pad_char": PAD_CHARACTER,
        # 64x128 is what the cct-v2 models expect. Changing it means the pre-trained
        # weights no longer fit and you are training from scratch, which needs far more
        # data than a campus produces.
        "img_height": 64,
        "img_width": 128,
    }

    path = dataset_dir / "plate_config.json"
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")

    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Fine-tune the plate OCR recogniser")
    parser.add_argument("--dataset", default="data/datasets", help="Dataset root")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument(
        "--batch-size",
        type=int,
        default=128,
        help="128 fits comfortably in the 4060's 8GB at 64x128 crops. Halve it if you OOM.",
    )
    parser.add_argument(
        "--lr",
        type=float,
        default=1e-4,
        help=(
            "Deliberately an order of magnitude below a from-scratch rate. Fine-tuning "
            "at a from-scratch learning rate erases the pre-trained weights in the first "
            "few hundred steps, which is how a fine-tune ends up worse than the base model."
        ),
    )
    parser.add_argument("--output", default="models/finetuned", help="Where to write weights")
    parser.add_argument("--print-only", action="store_true", help="Print the command, do not run")
    args = parser.parse_args()

    dataset_dir = Path(args.dataset)
    if not dataset_dir.is_absolute():
        dataset_dir = BACKEND_DIR / dataset_dir

    print("Auditing the dataset")
    print("-" * 62)

    ok, problems = audit_dataset(dataset_dir)

    if not ok:
        print("\nThe dataset is not ready:\n")
        for problem in problems[:25]:
            print(f"  - {problem}")
        if len(problems) > 25:
            print(f"  ... and {len(problems) - 25} more")
        print("\nFix these before training. None of them are warnings.\n")
        return 1

    config_path = write_config(dataset_dir)
    print(f"\nWrote {config_path}")

    output_dir = Path(args.output)
    if not output_dir.is_absolute():
        output_dir = BACKEND_DIR / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "fast_plate_ocr.cli.train",
        "--annotations",
        str(dataset_dir / "train" / "annotations.csv"),
        "--val-annotations",
        str(dataset_dir / "val" / "annotations.csv"),
        "--plate-config-file",
        str(config_path),
        "--epochs",
        str(args.epochs),
        "--batch-size",
        str(args.batch_size),
        "--lr",
        str(args.lr),
        "--output-dir",
        str(output_dir),
    ]

    print("\nTraining command:\n")
    print("  " + " \\\n    ".join(command))
    print()

    if args.print_only:
        return 0

    print("Starting. Watch validation accuracy, not training accuracy: a fine-tune on a")
    print("small set will fit the training data long before it learns anything general.\n")

    result = subprocess.run(command, check=False)

    if result.returncode != 0:
        print(
            "\nTraining exited non-zero. If the CLI's flags have changed in your installed"
            "\nversion, run with --print-only and adapt the command - `fast_plate_ocr"
            "\ntrain --help` lists what that version accepts.\n"
        )
        return result.returncode

    print(
        "\nDone. To use the result, export it to ONNX and point the service at it:\n"
        "\n  OCR_MODEL=\n"
        f"  OCR_MODEL_PATH={output_dir}/model.onnx\n"
        f"  OCR_CONFIG_PATH={config_path}\n"
        "\nThen re-run scripts/benchmark.py against the SAME labelled set you measured\n"
        "before. A fine-tune you have not measured against the baseline is not an\n"
        "improvement you can claim.\n"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
