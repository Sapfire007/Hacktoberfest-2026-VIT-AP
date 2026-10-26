"""
Benchmark the ANPR pipeline, and measure its accuracy against labelled plates.

Two modes, and they answer different questions:

    python scripts/benchmark.py --images data/samples
        Throughput only. How many frames a second, split between detection and OCR.

    python scripts/benchmark.py --images data/samples --labels data/samples/labels.csv
        Accuracy as well. Exact-match rate, character error rate, and the confusion pairs
        that are actually costing you - which is what tells you whether fine-tuning is
        worth doing and on what.

`labels.csv` is two columns, no header needed:

    filename,plate
    gate_0001.jpg,AP31AB1234
    gate_0002.jpg,TS09EA4567

Run this before and after any fine-tuning. A fine-tune with no before-number is not an
improvement, it is a hope.
"""

from __future__ import annotations

import argparse
import csv
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2

from app.core.pipeline import pipeline
from app.core.postprocess import normalize

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def load_labels(path: Path) -> dict[str, str]:
    labels: dict[str, str] = {}

    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.reader(handle):
            if len(row) < 2:
                continue
            filename, plate = row[0].strip(), row[1].strip()
            # Tolerate a header row without needing to be told about one.
            if filename.lower() in {"filename", "file", "image"}:
                continue
            labels[filename] = normalize(plate)

    return labels


def character_error_rate(expected: str, actual: str) -> float:
    """
    Levenshtein distance over the expected length.

    Exact-match rate alone hides the difference between a model that is one character off
    and one that is producing noise - and those call for completely different responses.
    """
    if not expected:
        return 1.0 if actual else 0.0

    previous = list(range(len(actual) + 1))

    for i, expected_char in enumerate(expected, start=1):
        current = [i]
        for j, actual_char in enumerate(actual, start=1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (expected_char != actual_char),
                )
            )
        previous = current

    return previous[-1] / len(expected)


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark the VISION ANPR pipeline")
    parser.add_argument("--images", required=True, help="Directory of images to run")
    parser.add_argument("--labels", help="CSV of filename,plate for accuracy scoring")
    parser.add_argument("--warmup", type=int, default=3, help="Untimed runs before measuring")
    parser.add_argument("--repeat", type=int, default=1, help="Timed passes over the set")
    args = parser.parse_args()

    image_dir = Path(args.images)
    if not image_dir.is_dir():
        print(f"Not a directory: {image_dir}")
        return 1

    paths = sorted(p for p in image_dir.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if not paths:
        print(f"No images found in {image_dir}")
        return 1

    labels = load_labels(Path(args.labels)) if args.labels else {}

    print(f"Loading models...")
    pipeline.load()
    print(f"Provider: {pipeline.provider}\n")

    frames = [(path, cv2.imread(str(path))) for path in paths]
    frames = [(path, frame) for path, frame in frames if frame is not None]

    print(f"{len(frames)} images | warmup={args.warmup} | repeat={args.repeat}")

    # Warm-up runs are discarded. The first few inferences on CUDA include kernel
    # compilation and memory-pool growth, which would otherwise dominate a small set and
    # make every optimisation look like it helped.
    for _ in range(args.warmup):
        pipeline.read(frames[0][1])

    timings: list[float] = []
    detected = 0
    exact = 0
    scored = 0
    cers: list[float] = []
    confusions: Counter[tuple[str, str]] = Counter()
    failures: list[tuple[str, str, str]] = []

    for _ in range(args.repeat):
        for path, frame in frames:
            started = time.perf_counter()
            detections = pipeline.read(frame)
            timings.append((time.perf_counter() - started) * 1000)

            if detections and detections[0].reading.plate:
                detected += 1

    # Accuracy is measured once, not per repeat - the result is deterministic and
    # repeating it would only inflate the counts.
    for path, frame in frames:
        expected = labels.get(path.name)
        if expected is None:
            continue

        scored += 1
        detections = pipeline.read(frame)
        actual = detections[0].reading.plate if detections else ""

        if actual == expected:
            exact += 1
        else:
            failures.append((path.name, expected, actual or "(no read)"))

            # Same-length mismatches are position-comparable, which is what makes the
            # confusion pairs meaningful. Different lengths mean a dropped or hallucinated
            # character, and pairing those up positionally would produce nonsense.
            if len(actual) == len(expected):
                for expected_char, actual_char in zip(expected, actual):
                    if expected_char != actual_char:
                        confusions[(expected_char, actual_char)] += 1

        cers.append(character_error_rate(expected, actual))

    print("\n" + "=" * 62)
    print("THROUGHPUT")
    print("=" * 62)
    print(f"  frames measured   : {len(timings)}")
    print(f"  mean              : {statistics.mean(timings):7.2f} ms")
    print(f"  median            : {statistics.median(timings):7.2f} ms")
    if len(timings) > 1:
        print(f"  p95               : {sorted(timings)[int(len(timings) * 0.95)]:7.2f} ms")
    print(f"  throughput        : {1000 / statistics.mean(timings):7.1f} frames/sec")
    print(f"  detection rate    : {detected / len(timings) * 100:7.1f}%  (a plate was read)")

    if scored:
        print("\n" + "=" * 62)
        print("ACCURACY")
        print("=" * 62)
        print(f"  labelled images   : {scored}")
        print(f"  exact match       : {exact}/{scored}  ({exact / scored * 100:.1f}%)")
        print(f"  char error rate   : {statistics.mean(cers) * 100:.2f}%")

        if confusions:
            print("\n  Most costly confusions (expected -> read):")
            for (expected_char, actual_char), count in confusions.most_common(12):
                print(f"    {expected_char} -> {actual_char}   x{count}")
            print(
                "\n  A pair here that postprocess.py does not already correct is worth\n"
                "  adding to LETTER_TO_DIGIT / DIGIT_TO_LETTER. A pair it does correct\n"
                "  and still gets wrong means the position is in the uncorrectable middle\n"
                "  of the plate - that one needs a fine-tune, not a rule."
            )

        if failures:
            print(f"\n  First {min(15, len(failures))} misreads:")
            for name, expected, actual in failures[:15]:
                print(f"    {name:<28} expected {expected:<12} got {actual}")

    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
