/**
 * Indian number plate normalisation and validation
 *
 * Shared by the gate service and the ANPR post-processing, so a plate typed by an officer
 * and a plate read by the model are held to exactly one standard. If these two disagreed,
 * "find the car that came in yesterday" would silently miss records.
 */

/**
 * Standard civilian format: two-letter state code, one or two digit RTO district code,
 * a one-to-three letter series, and a four digit number.
 *
 *     AP 31 AB 1234      TS 09 EA 4567      DL 8C AB 1234
 *
 * The series is optional because older plates were issued without one, and the district
 * code allows a trailing letter (DL 8C) because Delhi uses that form.
 *
 * Kept byte-for-byte equivalent to CIVILIAN_RE in the ANPR service's
 * `app/core/postprocess.py`. If the two ever disagree, a plate read by the camera and the
 * same plate typed by an officer stop matching each other in search.
 */
const CIVILIAN = /^[A-Z]{2}[0-9]{1,2}[A-Z]?[A-Z]{0,3}[0-9]{4}$/;

/**
 * Bharat series, introduced 2021 — year, "BH", four digits, then a one-or-two letter
 * series. These are increasingly common on new vehicles and do not match the civilian
 * pattern at all, so they need their own rule rather than a loosened one.
 *
 *     22 BH 1234 AA
 */
const BHARAT = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

/**
 * Some campus and defence vehicles carry formats this does not model. Rather than reject
 * them, the gate treats a non-matching plate as valid-but-unverified: the officer can
 * still save it, and `isRecognisedFormat` simply reports false so the UI can ask them to
 * look twice.
 */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Real Indian state and union-territory codes.
 *
 * Checked as well as the shape, because the shape alone accepts "XX 99 ZZ 0000" — which
 * is not a plate, and the whole point of this advisory check is to nudge an officer when
 * something is off. The ANPR service applies the same list (`STATE_CODES` in
 * `app/core/postprocess.py`); if the two drift, a plate the camera accepts and the same
 * plate typed by hand start being judged differently.
 */
const STATE_CODES = new Set(
  (
    'AN AP AR AS BR CG CH DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR ' +
    'PB PY RJ SK TN TR TS UK UP UA WB'
  ).split(' ')
);

export function isRecognisedFormat(plate: string): boolean {
  const normalized = normalizePlate(plate);

  if (BHARAT.test(normalized)) return true;

  return CIVILIAN.test(normalized) && STATE_CODES.has(normalized.slice(0, 2));
}

/**
 * Insert the spaces a person expects to see. Purely cosmetic — storage and search always
 * use the normalised form.
 *
 *     AP31AB1234  ->  AP 31 AB 1234
 */
export function formatPlateForDisplay(plate: string): string {
  const normalized = normalizePlate(plate);

  const bharat = normalized.match(/^([0-9]{2})(BH)([0-9]{4})([A-Z]{1,2})$/);
  if (bharat) return `${bharat[1]} ${bharat[2]} ${bharat[3]} ${bharat[4]}`;

  // The letter in the district group is lazy (`[A-Z]??`). Greedy, it swallows the first
  // letter of the series, and "AP31AB1234" comes out grouped as "AP 31A B 1234" — which
  // is not what is printed on the plate.
  const civilian = normalized.match(/^([A-Z]{2})([0-9]{1,2}[A-Z]??)([A-Z]{0,3})([0-9]{4})$/);
  if (civilian) {
    return [civilian[1], civilian[2], civilian[3], civilian[4]].filter(Boolean).join(' ');
  }

  return normalized;
}
