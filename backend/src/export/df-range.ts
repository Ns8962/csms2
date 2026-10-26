/**
 * Calendar-day maths for the DF export. Thailand has no daylight saving, so "Thai time" is a fixed UTC+7.
 * Clinic timestamps are real UTC instants (checked on live data), so a Thai day runs from 17:00 UTC the
 * evening before to 17:00 UTC.
 */
const THAI_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export interface DfRange {
  /** Inclusive start instant (00:00 Thai time on the first day). */
  start: Date;
  /** Exclusive end instant (00:00 Thai time on the day after the last day). */
  endExclusive: Date;
  /** Number of calendar days covered. */
  days: number;
}

/** `yyyy-mm-dd` to the UTC midnight of that day, or null when it is not a real calendar date. */
function dayNumber(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Date.UTC rolls 2026-02-31 over to March: reject anything that did not round-trip.
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
}

/** Returns the range, or an error message in Thai for the UI. */
export function parseDfRange(from: string, to: string): DfRange | string {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (a === null) return 'วันที่เริ่มต้นไม่ถูกต้อง';
  if (b === null) return 'วันที่สิ้นสุดไม่ถูกต้อง';
  if (a > b) return 'วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด';
  return {
    start: new Date(a - THAI_OFFSET_MS),
    endExclusive: new Date(b + DAY_MS - THAI_OFFSET_MS),
    days: Math.round((b - a) / DAY_MS) + 1,
  };
}

/** dd/mm/yyyy of the Thai calendar day an instant falls on (Gregorian year, as in the original script). */
export function thaiDate(instant: Date): string {
  const t = new Date(instant.getTime() + THAI_OFFSET_MS);
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${t.getUTCFullYear()}`;
}
