import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MongoServerError } from 'mongodb';
import writeXlsxFile from 'write-excel-file/node';
import { AuditService } from '../audit/audit.service.js';
import { ClinicConnectionService } from '../clinic/clinic-connection.service.js';
import { COLLECTIONS, DOCTOR_BILL_ACTIVE } from '../clinic/drease-v2.types.js';
import { toDecimal } from '../clinic/mongo-values.js';
import type { Actor } from '../common/auth/auth-user.js';
import { parseDfRange, thaiDate } from './df-range.js';
import type { ExportDfDto } from './export.dto.js';

/** More rows than this would not fit comfortably in memory on the small server; the user splits the range. */
export const MAX_EXPORT_ROWS = 50_000;
/** Clinic databases are live systems: never let one export run for long on them. */
const QUERY_TIMEOUT_MS = 45_000;
/** MongoDB error code MaxTimeMSExpired. */
const MAX_TIME_EXPIRED = 50;
/** Exports building at the same moment (each holds its rows and the zipped file in memory). */
const MAX_CONCURRENT = 2;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const HEADERS = ['วันที่', 'แพทย์/เจ้าหน้าที่', 'รายการ', 'สาขา', 'DF'];
const COLUMN_WIDTHS = [12, 28, 40, 28, 14];

interface DfRow {
  date: string;
  officer: string;
  title: string;
  branch: string;
  /** null when the stored amount is missing or not a number (it is then left blank in the file, not 0). */
  amount: number | null;
}

export interface DfExportFile {
  buffer: Buffer;
  filename: string;
  rows: number;
  /** Sum of the readable amounts. */
  total: number;
  /** Rows whose amount could not be read; they are blank in the file. */
  unreadable: number;
}

/** Text of a stored value; anything that is not text or a number (missing, object) becomes ''. */
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/**
 * DF amount as a number. Keeps the sign (the original shell script stripped every non-digit, which
 * turned a negative DF into a positive one). A missing amount is 0, as it was there. A stored value that
 * is not a number (live data has a Decimal128 NaN) gives null so it shows up blank instead of as a false 0.
 */
function amountOf(value: unknown): number | null {
  if (value === null || value === undefined) return 0;
  const d = toDecimal(value);
  if (!d) return null;
  const n = Number(d.toString());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Characters that are not allowed in a file name on Windows (and the IP dots are fine). */
const safeName = (s: string) => s.replace(/[^\w.-]/g, '_');

/**
 * ส่งออก DF: the doctor-fee lines (`doctorbills`, status active) created between two days, with the
 * branch name of their bill, oldest first, as an .xlsx file. Same query as the CS team's mongo shell script.
 */
@Injectable()
export class ExportService {
  private running = 0;

  constructor(
    private readonly clinic: ClinicConnectionService,
    private readonly audit: AuditService,
  ) {}

  async exportDf(dto: ExportDfDto, actor: Actor): Promise<DfExportFile> {
    const range = parseDfRange(dto.from, dto.to);
    if (typeof range === 'string') {
      throw new BadRequestException({ success: false, message: range });
    }
    if (this.running >= MAX_CONCURRENT) {
      throw new HttpException(
        { success: false, message: 'ระบบกำลังสร้างไฟล์ส่งออกอยู่ กรุณารอสักครู่แล้วลองใหม่' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.running++;
    try {
      const rows = await this.readRows(dto.ip, range.start, range.endExclusive);
      if (rows.length === 0) {
        // `code` lets the UI show "nothing in this range" as a normal result instead of an error.
        throw new NotFoundException({
          success: false,
          code: 'NO_DATA',
          message: `ไม่พบข้อมูล DF ในช่วง ${dto.from} ถึง ${dto.to}`,
        });
      }

      const total = Math.round(rows.reduce((sum, r) => sum + (r.amount ?? 0), 0) * 100) / 100;
      const unreadable = rows.filter((r) => r.amount === null).length;
      const buffer = await this.build(rows);
      const filename = `DF_${safeName(dto.ip)}_${dto.from}_${dto.to}.xlsx`;

      await this.audit.record({
        action: 'export.df',
        username: actor.user.username,
        clinicIp: dto.ip,
        clinicDb: this.clinic.dbName,
        collectionName: COLLECTIONS.doctorBills,
        documentId: `${dto.from}..${dto.to}`,
        before: null,
        after: { from: dto.from, to: dto.to, rows: rows.length, total, unreadable, file: filename },
        requestIp: actor.requestIp,
      });
      return { buffer, filename, rows: rows.length, total, unreadable };
    } finally {
      this.running--;
    }
  }

  /**
   * The pipeline of the original script (doctorbills -> lookup bills -> branch_name), with the sort moved
   * before the lookup so it does not hold whole bills in memory, and a `$limit` so a huge range stops early.
   */
  private readRows(ip: string, start: Date, endExclusive: Date): Promise<DfRow[]> {
    return this.clinic.run(ip, async (db) => {
      const cursor = db.collection(COLLECTIONS.doctorBills).aggregate(
        [
          { $match: { status: DOCTOR_BILL_ACTIVE, created_at: { $gte: start, $lt: endExclusive } } },
          { $sort: { created_at: 1, _id: 1 } },
          { $project: { officer_name: 1, title: 1, price_total: 1, bill_id: 1, created_at: 1 } },
          { $lookup: { from: COLLECTIONS.bills, localField: 'bill_id', foreignField: '_id', as: 'get_bill' } },
          { $unwind: '$get_bill' },
          {
            $project: {
              officer_name: 1,
              title: 1,
              price_total: 1,
              created_at: 1,
              'get_bill.branch_name': 1,
            },
          },
          { $limit: MAX_EXPORT_ROWS + 1 },
        ],
        { maxTimeMS: QUERY_TIMEOUT_MS },
      );

      const rows: DfRow[] = [];
      try {
        for await (const doc of cursor) {
          if (!(doc.created_at instanceof Date)) continue;
          rows.push({
            date: thaiDate(doc.created_at),
            officer: text(doc.officer_name),
            title: text(doc.title),
            branch: text(doc.get_bill?.branch_name),
            amount: amountOf(doc.price_total),
          });
        }
      } catch (err) {
        if (err instanceof MongoServerError && err.code === MAX_TIME_EXPIRED) {
          throw new HttpException(
            {
              success: false,
              message: 'เครื่องสาขาใช้เวลาค้นหานานเกินไป กรุณาลดช่วงวันที่ให้สั้นลงแล้วลองใหม่',
            },
            HttpStatus.GATEWAY_TIMEOUT,
          );
        }
        throw err;
      } finally {
        await cursor.close().catch(() => undefined);
      }

      if (rows.length > MAX_EXPORT_ROWS) {
        throw new PayloadTooLargeException({
          success: false,
          message: `มีข้อมูลมากกว่า ${MAX_EXPORT_ROWS.toLocaleString('en-US')} รายการ กรุณาลดช่วงวันที่ให้สั้นลง (เช่น แยกเป็นรายเดือน)`,
        });
      }
      return rows;
    });
  }

  private build(rows: DfRow[]): Promise<Buffer> {
    const header = HEADERS.map((value, i) => ({
      value,
      fontWeight: 'bold' as const,
      backgroundColor: '#DCE6F1',
      align: i === HEADERS.length - 1 ? ('right' as const) : ('left' as const),
      bottomBorderStyle: 'thin' as const,
    }));
    const data = [
      header,
      ...rows.map((r) => [
        r.date,
        r.officer,
        r.title,
        r.branch,
        r.amount === null ? null : { value: r.amount, type: Number, format: '#,##0.00' },
      ]),
    ];
    return writeXlsxFile(data, {
      sheet: 'DF',
      stickyRowsCount: 1,
      columns: COLUMN_WIDTHS.map((width) => ({ width })),
    }).toBuffer();
  }
}
