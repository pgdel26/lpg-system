/**
 * Month-picker arithmetic, shared by every screen that reports "by month".
 *
 * Extracted from ArSummaryTab when the Purchases screen adopted the same picker.
 * A second copy would have been a second set of edge cases to get right — leap
 * years, the year boundary, the clamp below — and no guarantee two screens agree
 * on which months are even selectable.
 *
 * Everything stays in `YYYY-MM` / `YYYY-MM-DD` string space and never touches
 * `Date` arithmetic, so nothing downstream can pick up a local-timezone offset.
 * A `new Date("2026-03-01")` in Manila is still February 28 in UTC, and that is
 * exactly how a month's first day ends up filed under the previous month.
 *
 * Pure module: no imports from lib/hooks, so the cron route can reach it (see
 * the lib/* server-reachability rule).
 */

/** First and last day of a YYYY-MM month, as YYYY-MM-DD strings. */
export function monthBounds(yyyymm: string): { start: string; end: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return { start: `${yyyymm}-01`, end: `${yyyymm}-${String(days).padStart(2, "0")}` };
}

export function addMonths(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  // ((n % 12) + 12) % 12 rather than n % 12: JS's remainder keeps the sign, so a
  // negative total would otherwise yield a month of 0 or less. Unreachable with
  // real dates, but the guard costs nothing and the failure would be silent.
  const month = ((total % 12) + 12) % 12;
  return `${Math.floor(total / 12)}-${String(month + 1).padStart(2, "0")}`;
}

/** The lower bound is clamped to 36 months so one 1970 typo can't generate a
 *  600-option picker; the range is then bounded by construction rather than by a
 *  loop guard that fails silently. */
const MAX_MONTHS = 36;

const MONTH_LABELS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export const monthLabel = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
};

/**
 * Selectable months, newest first, spanning the earliest given date's month
 * through the LATER of the current month and the latest given date's month.
 *
 * Both bounds matter. Dates here are operator-typed, so a single mis-typed year
 * can put a record outside the obvious range — and a month that isn't selectable
 * is data that exists in the collection but appears in no period on screen.
 * Including the current month regardless means a fresh month is always pickable
 * before anything has been recorded in it.
 *
 * @param dates YYYY-MM-DD strings; blanks are ignored. Pass dates from a source
 *   that covers the WHOLE history, not a paginated window — a picker built from
 *   a partial list silently hides the months it never loaded.
 */
export function monthOptions(dates: Array<string | undefined>, currentMonth: string): string[] {
  const sorted = dates.filter((d): d is string => !!d).sort();
  const last = sorted.length ? sorted[sorted.length - 1].slice(0, 7) : currentMonth;
  const newest = last > currentMonth ? last : currentMonth;
  const first = sorted.length ? sorted[0].slice(0, 7) : currentMonth;
  const floor = addMonths(newest, -(MAX_MONTHS - 1));
  const earliest = first > floor ? first : floor;
  const out: string[] = [];
  for (let key = earliest; key <= newest; key = addMonths(key, 1)) out.push(key);
  return out.reverse();
}
