import { HttpException, HttpStatus } from '@nestjs/common';
import { MongoServerError } from 'mongodb';
import writeXlsxFile from 'write-excel-file/node';
import { toDecimal } from '../clinic/mongo-values.js';

/**
 * More rows than this would not fit comfortably in memory on the small server; the user narrows the request.
 * Measured with the service's limits (heap 192 MB, 350 MB cgroup, two builds at once): DF (5 columns) fits at
 * 50,000 rows; courses (10 columns, longer text) need +291 MB at 50,000 and +200 MB at 30,000, and only ~270 MB
 * is free, so they stop at 30,000. The largest course export found on a live clinic has 830 rows.
 */
export const MAX_EXPORT_ROWS = 50_000;
export const MAX_COURSE_ROWS = 30_000;
/** Clinic databases are live systems: never let one export run for long on them. */
export const QUERY_TIMEOUT_MS = 45_000;
/** The phone lookup is a side note of the course report: shorter limit, and the report goes out without phones if it is exceeded. */
export const PHONE_QUERY_TIMEOUT_MS = 15_000;
/** MongoDB error code MaxTimeMSExpired. */
const MAX_TIME_EXPIRED = 50;
/** Exports building at the same moment (each holds its rows and the zipped file in memory). */
const MAX_CONCURRENT = 2;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Text of a stored value; anything that is not text or a number (missing, object) becomes ''. */
export const text = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

/**
 * Money as a number. Keeps the sign (the original shell scripts stripped every non-digit, which turned a
 * negative amount into a positive one). A missing amount is 0, as it was there. A stored value that is not
 * a number (live data has a Decimal128 NaN) gives null so it shows up blank instead of as a false 0.
 */
export function amountOf(value: unknown): number | null {
  if (value === null || value === undefined) return 0;
  const d = toDecimal(value);
  if (!d) return null;
  const n = Number(d.toString());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * A phone number as it should appear in the file: the first number-like part of the text, with spaces, dashes, dots and
 * brackets removed and a leading "+" kept ("081-234-5678" -> "0812345678", " 0812345678 (แม่)" -> "0812345678").
 * Fewer than 9 or more than 15 digits (placeholders such as "-" or "0", free text) give '': a blank cell, never a
 * made-up number. It is always written to the file as text, so the leading 0 survives.
 */
export function phoneOf(value: unknown): string {
  const raw = typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const found = /\+?\d[\d\s().-]{6,}\d/.exec(raw);
  if (!found) return '';
  const cleaned = found[0].replace(/[\s().-]/g, '');
  const digits = cleaned.replace(/\D/g, '').length;
  return digits >= 9 && digits <= 15 ? cleaned : '';
}

/** A count stored as a number (or numeric text); anything else is null (blank cell), never a made-up 0. */
export function countOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Characters that are not allowed in a file name on Windows (and the IP dots are fine). */
export const safeName = (s: string) => s.replace(/[^\w.-]/g, '_');

/** The query ran over its time limit on the clinic server: tell the user how to make it smaller. */
export function timeoutError(advice: string): HttpException {
  return new HttpException({ success: false, message: `เครื่องสาขาใช้เวลาค้นหานานเกินไป ${advice}` }, HttpStatus.GATEWAY_TIMEOUT);
}

export const isMaxTimeExpired = (err: unknown): boolean =>
  err instanceof MongoServerError && err.code === MAX_TIME_EXPIRED;

/**
 * Lets at most MAX_CONCURRENT exports run at once, across every export type: the limit protects the
 * memory of the host, not one report.
 */
export class ExportSlots {
  private running = 0;

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_CONCURRENT) {
      throw new HttpException(
        { success: false, message: 'ระบบกำลังสร้างไฟล์ส่งออกอยู่ กรุณารอสักครู่แล้วลองใหม่' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.running++;
    try {
      return await work();
    } finally {
      this.running--;
    }
  }
}

export type CellValue = string | number | null;

export interface SheetSpec {
  sheet: string;
  headers: string[];
  widths: number[];
  /** Index -> number format, for columns that hold numbers (they are also right-aligned in the header). */
  numberFormats: Record<number, string>;
  rows: CellValue[][];
}

/**
 * One-sheet workbook: bold, shaded, frozen header row; numbers as real numbers; text always as text (a value
 * such as `=1+1` is never turned into a formula). A null cell is left blank.
 */
export function buildXlsx(spec: SheetSpec): Promise<Buffer> {
  const header = spec.headers.map((value, i) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#DCE6F1',
    align: i in spec.numberFormats ? ('right' as const) : ('left' as const),
    bottomBorderStyle: 'thin' as const,
  }));
  const data = [
    header,
    ...spec.rows.map((row) =>
      row.map((cell, i) =>
        typeof cell === 'number' ? { value: cell, type: Number, format: spec.numberFormats[i] } : cell,
      ),
    ),
  ];
  return writeXlsxFile(data, {
    sheet: spec.sheet,
    stickyRowsCount: 1,
    columns: spec.widths.map((width) => ({ width })),
  }).toBuffer();
}
