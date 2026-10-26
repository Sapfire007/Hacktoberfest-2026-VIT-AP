/**
 * Indian mobile numbers, with or without the country code. Normalised to bare ten digits
 * so the same person's number matches across visits regardless of how it was typed.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
