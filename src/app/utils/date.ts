import { utcToZonedTime } from 'date-fns-tz';
import { intervalToDuration, isFuture } from 'date-fns';

export const displayFormattedDate = (stringDate?: string): string => {
  if (stringDate == null) {
    return '';
  }
  const date = new Date(stringDate);
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
};

export const formatDateShort = (
  dateString: string,
  timeZone?: string,
): string => {
  const usedTimezone = timeZone ?? 'UTC';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: usedTimezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

/** Short month name for a date, in the same UTC-by-default frame as
 * formatDateShort - used for the column headers of date grids. */
export const formatMonthShort = (
  dateString: string,
  timeZone?: string,
): string => {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone ?? 'UTC',
    month: 'short',
  }).format(new Date(dateString));
};

/**
 *
 * @param dateString date in ISO format
 * @returns Duration object with the time left for the token to expire
 */
export const getTimeLeftForTokenExpiration = (
  dateString: string,
): { future: boolean; duration: Duration } => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const targetDate = utcToZonedTime(new Date(dateString), timeZone);
  const now = utcToZonedTime(new Date(), timeZone);

  return {
    future: isFuture(targetDate),
    duration: intervalToDuration({ start: now, end: targetDate }),
  };
};

/**
 *
 * @param duration Duration object
 * @returns the formatted string of the duration wiht the pattern HH:MM:SS
 */
export const formatTokenExpiration = (duration: Duration): string => {
  const hours = ((duration?.days ?? 0) * 24 + (duration?.hours ?? 0))
    .toString()
    .padStart(2, '0');
  const minutes = (duration?.minutes ?? 0).toString().padStart(2, '0');
  const seconds = (duration?.seconds ?? 0).toString().padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Calendar-day difference between `date` and `now`, in UTC. Useful whenever
 * `now` is a single Date instance shared by a server render and the client
 * that hydrates it: date-fns's `differenceInCalendarDays` buckets by the
 * *local* calendar day of whichever machine runs it, so a server in UTC and a
 * browser in another zone can round the same instant to different days, most
 * visibly near midnight. Rebuilding both sides at UTC midnight keeps the diff
 * identical wherever it runs.
 */
export function utcCalendarDayDiff(date: Date, now: Date): number {
  const dateUtcDay = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const nowUtcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((dateUtcDay - nowUtcDay) / 86400000);
}

/**
 * `date` minus `months`, in UTC. Same rationale as `utcCalendarDayDiff`:
 * date-fns's `subMonths` rolls the calendar back in local time, so it can
 * return a different instant - and therefore a different displayed date -
 * depending on the timezone of the machine that evaluates it.
 *
 * The day of the month is clamped to the target month's length, the way
 * date-fns's `subMonths` does it. Handing `Date.UTC` an out-of-range day
 * instead rolls it *forward* into the next month - six months before Aug 31
 * would be Feb 31, i.e. Mar 3 - which silently shortens any window built
 * from it.
 */
export function subMonthsUtc(date: Date, months: number): Date {
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() - months;
  // Day 0 of the following month is the last day of the target month, and
  // `Date.UTC` normalises a month outside 0-11 into the right year for us.
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(date.getUTCDate(), daysInTargetMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
