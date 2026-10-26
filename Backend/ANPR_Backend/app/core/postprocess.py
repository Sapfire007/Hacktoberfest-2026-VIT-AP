"""
Plate string post-processing.

An OCR model returns characters; a number plate is a *grammar*. This module is the
difference between the two, and it is where most of the real-world accuracy comes from -
more than swapping one recogniser for another.

Three stages, in order:

1. **Normalise.** Strip everything that is not A-Z0-9, uppercase the rest. Plates carry
   state emblems, IND holograms, fasteners and hyphens that the recogniser sometimes
   emits as characters.

2. **Confusion correction.** A plate's character set is positionally constrained - the
   first two characters are always letters, the last four always digits - so an `O` where
   a digit belongs is unambiguously a `0`. This is a much stronger signal than a generic
   spell-check, because the ambiguity is resolved by *position*, not by guessing.

3. **Format validation.** Check the corrected string against the Indian plate grammar.
   A string that matches is reported as verified; one that does not is still returned,
   flagged, because campus vehicles, defence plates and foreign registrations are real
   and refusing to record them would push the officer back to pen and paper.

Nothing here ever silently discards a read. The officer sees what the model saw.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence

# --------------------------------------------------------------------------------------
# Format grammars
# --------------------------------------------------------------------------------------

# Standard civilian format: state code, RTO district code, series, four-digit number.
#     AP 31 AB 1234     TS 09 EA 4567     DL 8C AB 1234
# The series is optional (older plates were issued without one) and the district code
# allows a trailing letter, which is how Delhi writes it.
# The letter in the district group is lazy (`[A-Z]??`). Greedy, it swallows the first
# letter of the series and "AP31AB1234" groups as "AP 31A B 1234" - which is not what is
# printed on the plate. Lazy prefers the far more common form where the district code is
# purely numeric and the letters are the series.
CIVILIAN_RE = re.compile(r"^([A-Z]{2})([0-9]{1,2}[A-Z]??)([A-Z]{0,3})([0-9]{4})$")

# Bharat series, introduced 2021: year, "BH", four digits, one or two letter series.
#     22 BH 1234 AA
BHARAT_RE = re.compile(r"^([0-9]{2})(BH)([0-9]{4})([A-Z]{1,2})$")

# Valid Indian state and union territory codes. A read whose first two characters are not
# a real state code is almost always a misread of one that is - "4P" for "AP" - and this
# list is what makes that correctable rather than merely detectable.
STATE_CODES = frozenset(
    """
    AN AP AR AS BR CG CH DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR
    PB PY RJ SK TN TR TS UK UP UA WB
    """.split()
)

# --------------------------------------------------------------------------------------
# Confusion pairs
# --------------------------------------------------------------------------------------

# Characters an OCR model confuses in each direction. These are the classic plate
# confusions: the glyphs are near-identical in the condensed fonts plates use, and on a
# dirty or angled plate the remaining difference disappears.
LETTER_TO_DIGIT = {
    "O": "0",
    "Q": "0",
    "D": "0",
    "I": "1",
    "L": "1",
    "J": "1",
    "Z": "2",
    "A": "4",
    "S": "5",
    "G": "6",
    "T": "7",
    "B": "8",
    "P": "9",
}

DIGIT_TO_LETTER = {
    "0": "O",
    "1": "I",
    "2": "Z",
    "4": "A",
    "5": "S",
    "6": "G",
    "7": "T",
    "8": "B",
    "9": "P",
}


def normalize(raw: str) -> str:
    """Strip to bare A-Z0-9, uppercase. The canonical storage form."""
    return re.sub(r"[^A-Z0-9]", "", (raw or "").upper())


def _coerce(text: str, index: int, want_digit: bool) -> str:
    """Rewrite one character to the class the grammar requires at that position."""
    if index >= len(text):
        return text

    char = text[index]

    if want_digit and char.isalpha():
        replacement = LETTER_TO_DIGIT.get(char)
    elif not want_digit and char.isdigit():
        replacement = DIGIT_TO_LETTER.get(char)
    else:
        return text

    if replacement is None:
        return text

    return text[:index] + replacement + text[index + 1 :]


def apply_confusion_correction(plate: str) -> str:
    """
    Fix character-class errors using the positions the grammar fixes.

    Only the positions that are unambiguous get touched:

    - characters 0 and 1 are always letters (the state code);
    - the last four characters are always digits (the serial number).

    The middle - district code and series - is deliberately left alone. Its length varies
    between one and six characters depending on the plate, so a position in the middle
    does not determine a character class, and "correcting" it would invent errors.

    The Bharat series has its own layout (digits first) and is handled separately.
    """
    text = normalize(plate)

    if len(text) < 6:
        # Too short for any real format. Correcting it would be guessing at a fragment.
        return text

    # Bharat series: two digits, "BH", four digits, series letters.
    # Recognised by "BH" in positions 2-3, which no civilian plate has as its whole
    # district code followed by four digits.
    if len(text) >= 9 and text[2:4] in ("BH", "8H", "BH"):
        text = _coerce(text, 0, want_digit=True)
        text = _coerce(text, 1, want_digit=True)
        text = text[:2] + "BH" + text[4:]
        for index in range(4, 8):
            text = _coerce(text, index, want_digit=True)
        for index in range(8, len(text)):
            text = _coerce(text, index, want_digit=False)
        return text

    # Civilian: first two characters are the state code.
    text = _coerce(text, 0, want_digit=False)
    text = _coerce(text, 1, want_digit=False)

    # A state code that still is not real is usually one correctable character away from
    # one that is. Trying every single-character substitution is cheap - there are at most
    # 26 of them - and it recovers the most common failure on a dirty plate.
    if text[:2] not in STATE_CODES:
        text = _repair_state_code(text)

    # Last four characters are the serial number.
    for index in range(max(len(text) - 4, 0), len(text)):
        text = _coerce(text, index, want_digit=True)

    return text


def _repair_state_code(text: str) -> str:
    """
    Try to turn a near-miss state code into a real one with a single substitution.

    Ambiguous results are left alone: if two different real state codes are each one
    character away, there is no basis to pick one, and presenting a coin flip as a
    correction is worse than presenting the raw read.
    """
    prefix = text[:2]
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    candidates = set()
    for position in (0, 1):
        for letter in alphabet:
            candidate = prefix[:position] + letter + prefix[position + 1 :]
            if candidate in STATE_CODES:
                candidates.add(candidate)

    if len(candidates) == 1:
        return candidates.pop() + text[2:]

    return text


@dataclass
class PlateReading:
    """One post-processed plate read."""

    #: The recogniser's raw output, before anything was done to it. Kept so a wrong
    #: correction can always be traced back and the officer can see both.
    raw: str
    #: Normalised and confusion-corrected. This is what gets stored.
    plate: str
    #: With the spaces a person expects: "AP 31 AB 1234".
    display: str
    #: Mean character confidence from the recogniser, 0-1.
    confidence: float
    #: True when `plate` matches a known Indian plate grammar.
    format_valid: bool
    #: Which grammar matched, or None.
    format_name: Optional[str]
    #: True when confusion correction changed something. The app shows this, because an
    #: officer should know the string was adjusted before they accept it.
    corrected: bool


def identify_format(plate: str) -> Optional[str]:
    text = normalize(plate)

    bharat = BHARAT_RE.match(text)
    if bharat:
        return "bharat"

    civilian = CIVILIAN_RE.match(text)
    if civilian and civilian.group(1) in STATE_CODES:
        return "civilian"

    if civilian:
        # Right shape, unknown state code. Distinguished from a total mismatch because it
        # is usually a real plate from a code this list has not been updated for.
        return "civilian_unknown_state"

    return None


def format_for_display(plate: str) -> str:
    """Insert the conventional spacing. Cosmetic only - storage uses the bare form."""
    text = normalize(plate)

    bharat = BHARAT_RE.match(text)
    if bharat:
        return " ".join(bharat.groups())

    civilian = CIVILIAN_RE.match(text)
    if civilian:
        return " ".join(group for group in civilian.groups() if group)

    return text


def post_process(raw: str, confidence: float, country: str = "IN") -> PlateReading:
    """
    Turn one raw recogniser output into a finished reading.

    `country` other than "IN" skips correction and validation - the characters are
    normalised and returned as read, because applying Indian positional rules to a plate
    from elsewhere would corrupt it.
    """
    normalized = normalize(raw)

    if country != "IN":
        return PlateReading(
            raw=raw,
            plate=normalized,
            display=normalized,
            confidence=confidence,
            format_valid=False,
            format_name=None,
            corrected=False,
        )

    corrected = apply_confusion_correction(normalized)
    format_name = identify_format(corrected)

    # If correction produced something that does not parse but the uncorrected string
    # does, the correction made things worse - keep the original. This happens on plates
    # whose real characters genuinely sit in the "wrong" class, and the check costs
    # nothing.
    if format_name is None and identify_format(normalized) is not None:
        corrected = normalized
        format_name = identify_format(normalized)

    return PlateReading(
        raw=raw,
        plate=corrected,
        display=format_for_display(corrected),
        confidence=confidence,
        format_valid=format_name in ("civilian", "bharat"),
        format_name=format_name,
        corrected=corrected != normalized,
    )


# --------------------------------------------------------------------------------------
# Temporal voting
# --------------------------------------------------------------------------------------


@dataclass
class VoteResult:
    plate: str
    display: str
    confidence: float
    format_valid: bool
    #: How many of the submitted frames produced this plate.
    votes: int
    #: How many frames produced any readable plate at all.
    frames_with_reads: int
    #: Every distinct candidate and its vote count, best first. Shown to the officer so a
    #: close call is visible rather than hidden behind a single answer.
    candidates: List[dict]


def vote(readings: Sequence[PlateReading]) -> Optional[VoteResult]:
    """
    Pick the most likely plate from several frames of the same vehicle.

    A single frame's OCR is a coin weighted heavily towards correct; several frames of the
    same plate turn that into a near-certainty, because the errors are driven by
    per-frame conditions - motion blur, a glare band, a wiper - that do not repeat
    identically. This is the cheapest accuracy improvement available, and it costs only
    the frames the camera was producing anyway.

    Ranking is by (votes, mean confidence), with format-valid candidates preferred over
    invalid ones at equal votes: given "AP31AB1234" seen twice and "AP3IAB1234" seen
    twice, the one that is a legal plate is the better answer.
    """
    usable = [reading for reading in readings if reading.plate]
    if not usable:
        return None

    counts = Counter(reading.plate for reading in usable)

    def mean_confidence(plate: str) -> float:
        values = [reading.confidence for reading in usable if reading.plate == plate]
        return sum(values) / len(values) if values else 0.0

    def is_valid(plate: str) -> bool:
        return any(reading.format_valid for reading in usable if reading.plate == plate)

    ranked = sorted(
        counts.keys(),
        key=lambda plate: (counts[plate], is_valid(plate), mean_confidence(plate)),
        reverse=True,
    )

    winner = ranked[0]

    return VoteResult(
        plate=winner,
        display=format_for_display(winner),
        confidence=mean_confidence(winner),
        format_valid=is_valid(winner),
        votes=counts[winner],
        frames_with_reads=len(usable),
        candidates=[
            {
                "plate": plate,
                "display": format_for_display(plate),
                "votes": counts[plate],
                "confidence": round(mean_confidence(plate), 4),
                "format_valid": is_valid(plate),
            }
            for plate in ranked
        ],
    )
