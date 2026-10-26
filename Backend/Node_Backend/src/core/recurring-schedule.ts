/**
 * When a recurring pass admits its holder.
 *
 * Pure functions over the pass's schedule, so the scanner, the check-in transaction and the
 * tests all apply exactly the same rule: inside the date range, on an allowed weekday, and
 * between the daily start (with a little early grace) and the daily end.
 */

import { formatIst, istAt, istDateKey, istWeekday } from './ist';

/** How early before the daily start a holder may enter. */
export const RECURRING_EARLY_MINUTES = 30;
/** After the daily end, how long until today's visit counts as an overstay. */
export const RECURRING_OVERSTAY_GRACE_MINUTES = 60;

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Schedule {
  validFrom: string;
  validUntil: string;
  weekdays: number[];
  dailyStart: string;
  dailyEnd: string;
}

export type ScheduleRefusal = { reason: 'not_today' | 'outside_hours' | 'expired' | 'not_started'; detail: string };

/** Why this schedule does not admit anyone at `now`, or null if it does. */
export function scheduleRefusal(schedule: Schedule, now: Date): ScheduleRefusal | null {
  const today = istDateKey(now);

  if (today < schedule.validFrom) {
    return {
      reason: 'not_started',
      detail: `This pass starts on ${schedule.validFrom}.`,
    };
  }
  if (today > schedule.validUntil) {
    return {
      reason: 'expired',
      detail: `This pass ended on ${schedule.validUntil}. The holder needs a new pass.`,
    };
  }
  if (!schedule.weekdays.includes(istWeekday(now))) {
    return {
      reason: 'not_today',
      detail: `This pass is valid on ${describeWeekdays(schedule.weekdays)} only.`,
    };
  }

  const opens = istAt(today, schedule.dailyStart).getTime() - RECURRING_EARLY_MINUTES * 60 * 1000;
  const closes = istAt(today, schedule.dailyEnd).getTime();
  if (now.getTime() < opens || now.getTime() > closes) {
    return {
      reason: 'outside_hours',
      detail: `This pass is valid ${schedule.dailyStart}–${schedule.dailyEnd}. It is now ${formatIst(now)}.`,
    };
  }

  return null;
}

/** When today's visit on this pass should be over. */
export function todaysDeadline(schedule: Schedule, now: Date): Date {
  return new Date(
    istAt(istDateKey(now), schedule.dailyEnd).getTime() + RECURRING_OVERSTAY_GRACE_MINUTES * 60 * 1000
  );
}

export function describeWeekdays(weekdays: number[]): string {
  const sorted = [...weekdays].sort();
  if (sorted.length === 7) return 'every day';
  if (sorted.join(',') === '1,2,3,4,5') return 'weekdays';
  if (sorted.join(',') === '1,2,3,4,5,6') return 'Monday to Saturday';
  return sorted.map((d) => WEEKDAY_NAMES[d]).join(', ');
}
