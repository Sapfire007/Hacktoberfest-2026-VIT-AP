/**
 * India Standard Time helpers.
 *
 * Every campus rule is written in local time — "mess staff, weekdays, 6am to 10pm", "the
 * register for 28 September" — while the server may run in UTC anywhere. IST is a fixed
 * +05:30 with no daylight saving, so a constant offset is exact; no timezone database is
 * needed.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" in IST for an instant. */
export function istDateKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whether a string is a real "YYYY-MM-DD" calendar date. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The instant an IST calendar day starts. */
export function istDayStart(dateKey: string): Date {
  return new Date(new Date(`${dateKey}T00:00:00Z`).getTime() - IST_OFFSET_MS);
}

/** The first instant after an IST calendar day ends (exclusive bound). */
export function istDayEnd(dateKey: string): Date {
  return new Date(istDayStart(dateKey).getTime() + DAY_MS);
}

/** Add whole days to a date key. */
export function addDays(dateKey: string, days: number): string {
  return new Date(new Date(`${dateKey}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Days from `from` to `to`, inclusive of both. */
export function daysInclusive(from: string, to: string): number {
  return (
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS
    ) + 1
  );
}

/** Day of week in IST, 0 = Sunday. */
export function istWeekday(date: Date): number {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCDay();
}

/** Hour of day in IST, 0–23. */
export function istHour(date: Date): number {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();
}

/** Whether a string is a 24-hour "HH:MM" time. */
export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Minutes after midnight for "HH:MM". */
export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** The instant at "HH:MM" IST on a given IST day. */
export function istAt(dateKey: string, hhmm: string): Date {
  return new Date(istDayStart(dateKey).getTime() + minutesOfDay(hhmm) * 60 * 1000);
}

/** "28 Sept, 2:30 pm" in IST — for messages an officer reads. */
export function formatIst(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "14:05" in IST — for tables. */
export function formatIstTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}
