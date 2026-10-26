import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Document } from 'mongodb';
import { AuditService } from '../audit/audit.service.js';
import { ClinicConnectionService } from '../clinic/clinic-connection.service.js';
import {
  COLLECTIONS,
  COURSE_BILL_ACTIVE,
  DOCTOR_BILL_ACTIVE,
} from '../clinic/drease-v2.types.js';
import type { Actor } from '../common/auth/auth-user.js';
import { parseDfRange, parseDueRange, thaiDate, utcDayDashed } from './df-range.js';
import type { ExportBranchesDto, ExportCoursesDto, ExportDfDto } from './export.dto.js';
import {
  amountOf,
  buildXlsx,
  type CellValue,
  countOf,
  ExportSlots,
  isMaxTimeExpired,
  MAX_COURSE_ROWS,
  MAX_EXPORT_ROWS,
  QUERY_TIMEOUT_MS,
  safeName,
  text,
  timeoutError,
} from './export-support.js';

export { MAX_EXPORT_ROWS, XLSX_MIME } from './export-support.js';

const BRANCH_CACHE_MS = 10 * 60_000;
const MAX_BRANCHES = 500;

interface DfRow {
  date: string;
  officer: string;
  title: string;
  branch: string;
  /** null when the stored amount is missing or not a number (it is then left blank in the file, not 0). */
  amount: number | null;
}

interface CourseRow {
  hn: string;
  patient: string;
  course: string;
  price: number | null;
  total: number | null;
  remaining: number | null;
  code: string;
  treatment: string;
  expire: string;
  branch: string;
}

export interface Branch {
  code: string;
  name: string;
}

interface ExportFileBase {
  buffer: Buffer;
  filename: string;
  rows: number;
}

export interface DfExportFile extends ExportFileBase {
  /** Sum of the readable amounts. */
  total: number;
  /** Rows whose amount could not be read; they are blank in the file. */
  unreadable: number;
}

export interface CoursesExportFile extends ExportFileBase {
  /** Distinct purchased courses behind the rows. */
  courses: number;
  /** Rows whose price could not be read; they are blank in the file. */
  unreadable: number;
  /** Rows whose treatment is not in `listheals` (code and name left blank). */
  noTreatment: number;
  /** Active course purchases skipped because their bill is missing, so no branch can be shown (all-branches export only). */
  noBill: number;
}

const DF_HEADERS = ['วันที่', 'แพทย์/เจ้าหน้าที่', 'รายการ', 'สาขา', 'DF'];
const DF_WIDTHS = [12, 28, 40, 28, 14];

const COURSE_HEADERS = [
  'HN',
  'ชื่อผู้ป่วย',
  'ชื่อคอร์ส',
  'ราคาคอร์ส',
  'จำนวนครั้งตามคอร์ส',
  'จำนวนครั้งคงเหลือ',
  'รหัสรายการ',
  'ชื่อรายการ',
  'วันหมดอายุ',
  'สาขา',
];
const COURSE_WIDTHS = [14, 28, 34, 14, 20, 20, 14, 36, 14, 28];

type BranchFilter = ExportCoursesDto['branch'];

/** What the audit log shows for the branch filter. */
const branchLabel = (branch: BranchFilter) => (branch ? `${branch.code} ${branch.name}`.trim() : 'ทุกสาขา');

/**
 * Branch part of the file name: the code, plus the name when the whole name is safe to put in a file name.
 * A name with Thai (or other non-ASCII) letters would lose them and leave a meaningless remainder such as
 * "3" for "สาขาพระราม 3", so then only the code is used.
 */
function branchFileLabel(branch: BranchFilter): string {
  if (!branch) return 'all';
  const tidy = (s: string, max: number) => safeName(s).replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, max);
  const code = tidy(branch.code, 20) || 'branch';
  const asciiOnly = /^[\x20-\x7E]*$/.test(branch.name);
  const name = asciiOnly ? tidy(branch.name, 30) : '';
  return name ? `${code}-${name}` : code;
}

/**
 * ส่งออก: reports as .xlsx files. Same queries as the CS team's mongo shell scripts, but read-only
 * (the scripts' createIndex lines are not run: this tool never writes to a clinic database).
 */
@Injectable()
export class ExportService {
  private readonly slots = new ExportSlots();
  private readonly branchCache = new Map<string, { at: number; branches: Branch[] }>();

  constructor(
    private readonly clinic: ClinicConnectionService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- Export DF

  async exportDf(dto: ExportDfDto, actor: Actor): Promise<DfExportFile> {
    const range = parseDfRange(dto.from, dto.to);
    if (typeof range === 'string') {
      throw new BadRequestException({ success: false, message: range });
    }

    return this.slots.run(async () => {
      const rows = await this.readDfRows(dto.ip, range.start, range.endExclusive);
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
      const buffer = await buildXlsx({
        sheet: 'DF',
        headers: DF_HEADERS,
        widths: DF_WIDTHS,
        numberFormats: { 4: '#,##0.00' },
        rows: rows.map((r) => [r.date, r.officer, r.title, r.branch, r.amount]),
      });
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
    });
  }

  /**
   * The pipeline of the original script (doctorbills -> lookup bills -> branch_name), with the sort moved
   * before the lookup so it does not hold whole bills in memory, and a `$limit` so a huge range stops early.
   */
  private readDfRows(ip: string, start: Date, endExclusive: Date): Promise<DfRow[]> {
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
        if (isMaxTimeExpired(err)) throw timeoutError('กรุณาลดช่วงวันที่ให้สั้นลงแล้วลองใหม่');
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

  // ------------------------------------------------------------ Export courses

  /**
   * Branches seen on the bills of a clinic server, for the branch picker. DreaseV2 has no branch collection, so
   * this groups `bills`, which scans the whole collection: the answer is kept for 10 minutes per clinic.
   * The pair (code, name) is the identity: live data reuses one code for several branches.
   */
  async listBranches(dto: ExportBranchesDto): Promise<Branch[]> {
    const cached = this.branchCache.get(dto.ip);
    if (cached && Date.now() - cached.at < BRANCH_CACHE_MS) return cached.branches;

    const branches = await this.clinic.run(dto.ip, async (db) => {
      try {
        const groups = await db
          .collection(COLLECTIONS.bills)
          .aggregate(
            [
              { $match: { branch_code: { $type: 'string' } } },
              { $group: { _id: { code: '$branch_code', name: '$branch_name' } } },
              { $sort: { '_id.code': 1, '_id.name': 1 } },
              { $limit: MAX_BRANCHES },
            ],
            { maxTimeMS: QUERY_TIMEOUT_MS },
          )
          .toArray();
        return groups.map((g) => ({ code: text(g._id.code), name: text(g._id.name) }));
      } catch (err) {
        if (isMaxTimeExpired(err)) throw timeoutError('กรุณาลองใหม่อีกครั้ง หรือเลือก "ทุกสาขา"');
        throw err;
      }
    });
    this.branchCache.set(dto.ip, { at: Date.now(), branches });
    return branches;
  }

  async exportCourses(dto: ExportCoursesDto, actor: Actor): Promise<CoursesExportFile> {
    const due = parseDueRange(dto.due_from, dto.due_to);
    if (typeof due === 'string') {
      throw new BadRequestException({ success: false, message: due });
    }

    return this.slots.run(async () => {
      const result = await this.readCourseRows(dto, due);
      const { rows } = result;
      if (rows.length === 0) {
        throw new NotFoundException({
          success: false,
          code: 'NO_DATA',
          message: 'ไม่พบคอร์สที่ยังใช้งานอยู่ตามเงื่อนไขที่เลือก',
        });
      }

      const buffer = await buildXlsx({
        sheet: 'คอร์สคงเหลือ',
        headers: COURSE_HEADERS,
        widths: COURSE_WIDTHS,
        numberFormats: { 3: '#,##0.00', 4: '0.##', 5: '0.##' },
        rows: rows.map(
          (r): CellValue[] => [r.hn, r.patient, r.course, r.price, r.total, r.remaining, r.code, r.treatment, r.expire, r.branch],
        ),
      });
      const stamp = thaiDate(new Date()).split('/').reverse().join('-');
      const filename = `Courses_${safeName(dto.ip)}_${branchFileLabel(dto.branch)}_${stamp}.xlsx`;
      const unreadable = rows.filter((r) => r.price === null).length;
      const noTreatment = rows.filter((r) => r.code === '' && r.treatment === '').length;

      await this.audit.record({
        action: 'export.courses',
        username: actor.user.username,
        clinicIp: dto.ip,
        clinicDb: this.clinic.dbName,
        collectionName: COLLECTIONS.courseBills,
        documentId: `${branchLabel(dto.branch)} ${dto.due_from ?? ''}..${dto.due_to ?? ''}`.trim(),
        before: null,
        after: {
          branch_code: dto.branch?.code ?? null,
          branch_name: dto.branch?.name ?? null,
          due_from: dto.due_from ?? null,
          due_to: dto.due_to ?? null,
          rows: rows.length,
          courses: result.courses,
          unreadable,
          noTreatment,
          noBill: result.noBill,
          file: filename,
        },
        requestIp: actor.requestIp,
      });
      return { buffer, filename, rows: rows.length, courses: result.courses, unreadable, noTreatment, noBill: result.noBill };
    });
  }

  /**
   * The CS team's course script: active `course_bills` (optionally expiring in a range) -> bill (for the branch)
   * -> one row per treatment in the course -> `listheals` (for the code and name).
   * Stages are the same as the script's, in an equivalent order: the branch filter runs before the course
   * is split into rows, and the script's second `$unwind` of `course_list` (a no-op on an already unwound
   * field) and its `createIndex` calls (writes to the clinic) are left out.
   */
  private readCourseRows(
    dto: ExportCoursesDto,
    due: { from?: Date; toExclusive?: Date },
  ): Promise<{ rows: CourseRow[]; courses: number; noBill: number }> {
    const dueMatch =
      due.from || due.toExclusive
        ? { due_date: { ...(due.from ? { $gte: due.from } : {}), ...(due.toExclusive ? { $lt: due.toExclusive } : {}) } }
        : {};
    // Code and name must both match as stored. An empty name stands for bills that have no branch name at all.
    const branch = dto.branch;
    const branchMatch = branch
      ? [
          {
            $match: {
              'get_bill.branch_code': branch.code,
              'get_bill.branch_name': branch.name === '' ? { $in: [null, ''] } : branch.name,
            },
          },
        ]
      : [];

    return this.clinic.run(dto.ip, async (db) => {
      const courseBills = db.collection(COLLECTIONS.courseBills);
      const pipeline: Document[] = [
        { $match: { status: COURSE_BILL_ACTIVE, ...dueMatch } },
        { $lookup: { from: COLLECTIONS.bills, localField: 'bill_id', foreignField: '_id', as: 'get_bill' } },
        { $unwind: '$get_bill' },
        ...branchMatch,
        { $unwind: '$course_list' },
        {
          $project: {
            price_of_course: 1,
            name: 1,
            data_hn: 1,
            due_date: 1,
            'course_list.heal_id': 1,
            'course_list.number_of_time_default': 1,
            'course_list.number_of_time': 1,
            'get_bill.branch_name': 1,
          },
        },
        { $lookup: { from: COLLECTIONS.listHeals, localField: 'course_list.heal_id', foreignField: '_id', as: 'get_listheals' } },
        { $unwind: { path: '$get_listheals', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            price_of_course: 1,
            name: 1,
            data_hn: 1,
            due_date: 1,
            course_list: 1,
            'get_bill.branch_name': 1,
            'get_listheals.code': 1,
            'get_listheals.name_th': 1,
          },
        },
        { $limit: MAX_COURSE_ROWS + 1 },
      ];
      const cursor = courseBills.aggregate(pipeline, { maxTimeMS: QUERY_TIMEOUT_MS });

      const rows: CourseRow[] = [];
      const courseIds = new Set<string>();
      try {
        for await (const doc of cursor) {
          courseIds.add(String(doc._id));
          rows.push({
            hn: text(doc.data_hn?.hn),
            patient: text(doc.data_hn?.name),
            course: text(doc.name),
            price: amountOf(doc.price_of_course),
            total: countOf(doc.course_list?.number_of_time_default),
            remaining: countOf(doc.course_list?.number_of_time),
            code: text(doc.get_listheals?.code),
            treatment: text(doc.get_listheals?.name_th),
            expire: doc.due_date instanceof Date ? utcDayDashed(doc.due_date) : '',
            branch: text(doc.get_bill?.branch_name),
          });
        }
      } catch (err) {
        if (isMaxTimeExpired(err)) {
          throw timeoutError('กรุณาเลือกสาขา หรือกำหนดช่วงวันหมดอายุให้แคบลงแล้วลองใหม่');
        }
        throw err;
      } finally {
        await cursor.close().catch(() => undefined);
      }

      if (rows.length > MAX_COURSE_ROWS) {
        throw new PayloadTooLargeException({
          success: false,
          message: `มีข้อมูลมากกว่า ${MAX_COURSE_ROWS.toLocaleString('en-US')} แถว กรุณาเลือกสาขา หรือกำหนดช่วงวันหมดอายุให้แคบลง`,
        });
      }

      // Active purchases without a bill are not in the file (the script drops them too: no bill, no branch).
      // Say how many, so a total that looks complete is not silently short. Not needed when one branch was picked.
      // (bill_id can be null, absent, or point at a bill that no longer exists: all three are counted.)
      let noBill = 0;
      if (!branch && rows.length > 0) {
        try {
          const orphans = await courseBills
            .aggregate(
              [
                { $match: { status: COURSE_BILL_ACTIVE, ...dueMatch } },
                { $lookup: { from: COLLECTIONS.bills, localField: 'bill_id', foreignField: '_id', as: 'b' } },
                { $match: { b: { $size: 0 } } },
                { $count: 'n' },
              ],
              { maxTimeMS: QUERY_TIMEOUT_MS },
            )
            .toArray();
          noBill = orphans[0]?.n ?? 0;
        } catch (err) {
          // The file itself is fine; only this side note is lost.
          if (!isMaxTimeExpired(err)) throw err;
        }
      }
      return { rows, courses: courseIds.size, noBill };
    });
  }
}
