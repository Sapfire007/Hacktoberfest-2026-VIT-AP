"""
Turn captured gate crops into a labelled fine-tuning dataset.

The workflow this script sits in the middle of:

    1. Run the service with SAVE_CROPS=true for a week of real gate traffic.
       Every detected plate crop lands in data/crops/<date>/ named with what the model
       read and how confident it was.

    2. Run this script in `triage` mode. It sorts the crops by confidence and writes a
       labels CSV pre-filled with the model's own reads.

    3. Correct that CSV by hand. This is the actual work, and there is no way around it:
       open the low-confidence crops first, because those are both the ones most likely
       to be wrong and the ones the model learns most from.

    4. Run this script in `split` mode to produce train/val sets.

    5. Fine-tune with scripts/finetune_ocr.py.

Why the model's own reads as a starting point: on a decent pre-trained model most crops
are already correct, so pre-filling turns "type 2,000 plates" into "check 2,000 plates and
fix 150". Sorting by confidence puts the 150 near the top.

Usage:

    python scripts/prepare_dataset.py triage --crops data/crops --out data/datasets/labels.csv
    python scripts/prepare_dataset.py split  --labels data/datasets/labels.csv --out data/datasets
"""

from __future__ import annotations

import argparse
import csv
import random
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.postprocess import identify_format, normalize

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}

# Crops are saved as "<plate>_<confidence>_<uuid>.jpg" by the /read endpoint.
CROP_NAME_RE = re.compile(r"^(?P<plate>[A-Z0-9]+|unread)_(?P<confidence>[0-9.]+)_[0-9a-f]+$")


def triage(crops_dir: Path, out_csv: Path) -> int:
    """
    Build a labels CSV from saved crops, pre-filled with the model's reads and ordered so
    the doubtful ones come first.
    """
    if not crops_dir.is_dir():
        print(f"No such directory: {crops_dir}")
        return 1

    rows: list[tuple[float, str, str, str]] = []

    for path in sorted(crops_dir.rglob("*")):
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue

        match = CROP_NAME_RE.match(path.stem)

        if match:
            plate = "" if match.group("plate") == "unread" else match.group("plate")
            confidence = float(match.group("confidence"))
        else:
            # A crop dropped in by hand, from another source. Left unlabelled rather than
            # guessed at.
            plate, confidence = "", 0.0

        format_name = identify_format(plate) if plate else None
        needs_review = (
            not plate
            or confidence < 0.8
            or format_name not in ("civilian", "bharat")
        )

        rows.append(
            (
                # Sort key: everything needing review first, then ascending confidence.
                confidence if not needs_review else confidence - 10,
                str(path.relative_to(crops_dir)).replace("\\", "/"),
                plate,
                "REVIEW" if needs_review else "",
            )
        )

    if not rows:
        print(f"No crops found under {crops_dir}")
        return 1

    rows.sort(key=lambda row: row[0])

    out_csv.parent.mkdir(parents=True, exist_ok=True)

    with out_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["image", "plate", "flag"])
        for _, relative_path, plate, flag in rows:
            writer.writerow([relative_path, plate, flag])

    flagged = sum(1 for row in rows if row[3] == "REVIEW")

    print(f"Wrote {out_csv}")
    print(f"  {len(rows)} crops")
    print(f"  {flagged} flagged REVIEW - unread, low confidence, or not a valid format")
    print()
    print("Next: open that CSV and fix the plate column, top rows first.")
    print("Clear the flag column as you go so you can see what is left.")
    print("Delete rows whose crop is not actually a plate - a mislabelled negative")
    print("teaches the model something false, which is worse than teaching it nothing.")

    return 0


def split(labels_csv: Path, crops_dir: Path, out_dir: Path, val_fraction: float, seed: int) -> int:
    """
    Split a corrected labels CSV into train and val sets, copying the images alongside.

    The split is random but seeded, so the same command produces the same split. An
    unseeded split makes two training runs incomparable: a difference in the score could
    be the change you made or could be an easier validation set.
    """
    if not labels_csv.is_file():
        print(f"No such file: {labels_csv}")
        return 1

    entries: list[tuple[str, str]] = []
    skipped_unlabelled = 0
    skipped_invalid = 0

    with labels_csv.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        next(reader, None)  # header

        for row in reader:
            if len(row) < 2:
                continue

            image, plate = row[0].strip(), normalize(row[1])

            if not plate:
                skipped_unlabelled += 1
                continue

            # A row still flagged REVIEW was never checked. Training on the model's own
            # uncorrected output teaches it to repeat its own mistakes with more
            # confidence, which is worse than not training at all.
            if len(row) > 2 and row[2].strip().upper() == "REVIEW":
                skipped_unlabelled += 1
                continue

            if identify_format(plate) is None:
                skipped_invalid += 1
                continue

            entries.append((image, plate))

    if not entries:
        print("No usable labelled rows. Have you corrected the CSV yet?")
        return 1

    random.Random(seed).shuffle(entries)

    split_at = max(1, int(len(entries) * (1 - val_fraction)))
    splits = {"train": entries[:split_at], "val": entries[split_at:]}

    for name, subset in splits.items():
        image_dir = out_dir / name / "images"
        image_dir.mkdir(parents=True, exist_ok=True)

        annotations = out_dir / name / "annotations.csv"

        with annotations.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(["image_path", "plate_text"])

            for relative_path, plate in subset:
                source = crops_dir / relative_path
                if not source.is_file():
                    continue

                # Flattened, and named for the plate, so the dataset directory is
                # browsable and a mislabelled image is visible at a glance.
                destination = image_dir / f"{plate}_{source.stem[-8:]}{source.suffix}"
                shutil.copy2(source, destination)
                writer.writerow([f"images/{destination.name}", plate])

        print(f"  {name:<6} {len(subset):>5} samples -> {annotations}")

    print()
    print(f"Skipped {skipped_unlabelled} unlabelled or still-flagged rows")
    print(f"Skipped {skipped_invalid} rows whose plate does not match a known format")
    print()
    print("Next: python scripts/finetune_ocr.py --dataset", out_dir)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare an ANPR fine-tuning dataset")
    subparsers = parser.add_subparsers(dest="command", required=True)

    triage_parser = subparsers.add_parser("triage", help="Build a labels CSV from saved crops")
    triage_parser.add_argument("--crops", default="data/crops")
    triage_parser.add_argument("--out", default="data/datasets/labels.csv")

    split_parser = subparsers.add_parser("split", help="Split a corrected CSV into train/val")
    split_parser.add_argument("--labels", default="data/datasets/labels.csv")
    split_parser.add_argument("--crops", default="data/crops")
    split_parser.add_argument("--out", default="data/datasets")
    split_parser.add_argument("--val-fraction", type=float, default=0.15)
    split_parser.add_argument("--seed", type=int, default=1337)

    args = parser.parse_args()

    if args.command == "triage":
        return triage(Path(args.crops), Path(args.out))

    return split(
        Path(args.labels),
        Path(args.crops),
        Path(args.out),
        args.val_fraction,
        args.seed,
    )


if __name__ == "__main__":
    raise SystemExit(main())
