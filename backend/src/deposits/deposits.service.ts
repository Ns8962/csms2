import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Db, Decimal128, type Filter, ObjectId } from 'mongodb';
import type { AuditAction } from '../audit/audit-log.schema.js';
import { AuditService } from '../audit/audit.service.js';
import { ClinicConnectionService } from '../clinic/clinic-connection.service.js';
import {
  BILL_STATUS_DELETED,
  type BillDoc,
  COLLECTIONS,
  DEPOSIT_ACTIVE,
  DEPOSIT_ITEM,
  DEPOSIT_REMOVED,
  type DepositBillDoc,
} from '../clinic/drease-v2.types.js';
import { decimalText, invoicePrefix, toDecimal } from '../clinic/mongo-values.js';
import type { Actor } from '../common/auth/auth-user.js';
import type {
  CreateDepositDto,
  DeleteDepositDto,
  SearchBillsDto,
  SearchDepositsByHnDto,
  SearchDepositsDto,
  UpdateDepositDto,
} from './deposits.dto.js';

const MAX_BILLS_PER_INVOICE_SEARCH = 50;
const MAX_BILLS_FOR_ITEMS = 5;
const MAX_DEPOSITS = 200;
const INVOICE_MIN_LENGTH = 7;

const NOT_FOUND = 'ไม่พบรายการมัดจำ (อาจถูกลบไปแล้ว) กรุณาค้นหาใหม่';

/** Plain-JSON copy of a deposit row for the audit log. */
function snapshot(d: DepositBillDoc, invoice: string) {
  return {
    hn: d.hn ?? null,
    patient_name: d.patient_name ?? null,
    name: d.name ?? null,
    invoice,
    bill_id: d.bill_id ? String(d.bill_id) : null,
    bill_list_id: d.bill_list_id ? String(d.bill_list_id) : null,
    amount_defualt: decimalText(d.amount_defualt),
    amount_current: decimalText(d.amount_current),
    active: d.active ?? null,
  };
}

/**
 * The three CSMS tools, operating on a branch's DreaseV2 `deposit_bills` / `bills`.
 * Response shapes match the original server so Decimal128 values still arrive as
 * `{ "$numberDecimal": "..." }`.
 */
@Injectable()
export class DepositsService {
  constructor(
    private readonly clinic: ClinicConnectionService,
    private readonly audit: AuditService,
  ) {}

  /** คืนยอดมัดจำ — active deposits filtered by HN and/or the invoice they were bought on. */
  searchForReturn(dto: SearchDepositsDto) {
    const hn = dto.hn ?? '';
    const invoice = dto.invoice ?? '';
    if (!hn && !invoice) {
      throw new BadRequestException({
        success: false,
        message: 'กรุณากรอก HN หรือ Invoice',
        results: [],
      });
    }
    if (invoice && invoice.length < INVOICE_MIN_LENGTH) {
      throw new BadRequestException({
        success: false,
        message: 'Invoice ไม่ถูกต้อง กรุณากรอกให้ครบ',
        results: [],
      });
    }

    return this.clinic.run(dto.ip, async (db) => {
      const filter: Filter<DepositBillDoc> = { active: DEPOSIT_ACTIVE };
      if (hn) filter.hn = hn;
      if (invoice) {
        const bills = await db
          .collection<BillDoc>(COLLECTIONS.bills)
          .find({ invoice_no: invoicePrefix(invoice) }, { projection: { _id: 1 } })
          .limit(MAX_BILLS_PER_INVOICE_SEARCH)
          .toArray();
        if (bills.length === 0) return { success: true, results: [] };
        filter.bill_id = { $in: bills.map((b) => b._id) };
      }

      const deposits = await db
        .collection<DepositBillDoc>(COLLECTIONS.depositBills)
        .find(filter)
        .sort({ created_at: -1 })
        .limit(MAX_DEPOSITS)
        .toArray();
      const invoices = await this.invoiceMap(db, deposits);

      return {
        success: true,
        results: deposits.map((d) => ({
          _id: d._id,
          invoice_no: invoices.get(String(d.bill_id)) ?? '',
          deposit_name: d.name ?? '',
          amount_defualt: d.amount_defualt ?? null,
          amount_current: d.amount_current ?? null,
          hn: d.hn ?? '',
          patient_name: d.patient_name ?? '',
          created_at: d.created_at ?? null,
        })),
      };
    });
  }

  /** แก้ไขมูลค่ามัดจำ — set amount_current (0 … amount_defualt). */
  updateAmount(dto: UpdateDepositDto, actor: Actor) {
    const id = new ObjectId(dto.id);
    const next = Decimal128.fromString(dto.amountCurrent);

    return this.clinic.run(dto.ip, async (db) => {
      const deposits = db.collection<DepositBillDoc>(COLLECTIONS.depositBills);
      const current = await deposits.findOne({ _id: id, active: DEPOSIT_ACTIVE });
      if (!current) throw new NotFoundException({ success: false, message: NOT_FOUND });

      const purchased = decimalText(current.amount_defualt);
      if (purchased !== null && Number(dto.amountCurrent) > Number(purchased)) {
        throw new UnprocessableEntityException({
          success: false,
          message: `มูลค่าตอนนี้ต้องไม่เกินมูลค่าที่ซื้อ (${purchased})`,
        });
      }

      // Write only if nobody changed the amount since it was read.
      const result = await deposits.updateOne(
        { _id: id, active: DEPOSIT_ACTIVE, amount_current: current.amount_current },
        { $set: { amount_current: next } },
      );
      if (result.matchedCount === 0) {
        throw new ConflictException({
          success: false,
          message: 'รายการนี้ถูกแก้ไขระหว่างนี้ กรุณาค้นหาใหม่อีกครั้ง',
        });
      }

      const invoice = await this.invoiceOf(db, current.bill_id);
      const before = snapshot(current, invoice);
      await this.log('deposit.update', dto.ip, id, actor, before, {
        ...before,
        amount_current: next.toString(),
      });
      return { success: true, amount_current: next };
    });
  }

  /** รายการมัดจำไม่แสดง step 1 — deposit line items of a (non-deleted) bill. */
  searchBills(dto: SearchBillsDto) {
    return this.clinic.run(dto.ip, async (db) => {
      const bills = await db
        .collection<BillDoc>(COLLECTIONS.bills)
        .find(
          { invoice_no: invoicePrefix(dto.invoice), status: { $ne: BILL_STATUS_DELETED } },
          { projection: { invoice_no: 1, hn: 1, patient_name: 1, status: 1, list: 1 } },
        )
        .sort({ created_at: -1 })
        .limit(MAX_BILLS_FOR_ITEMS)
        .toArray();

      const found = bills.flatMap((bill) =>
        (bill.list ?? [])
          .filter((item) => item?._id && item.deposit_status === DEPOSIT_ITEM)
          .map((item) => ({ bill, item })),
      );
      if (found.length === 0) {
        return {
          success: false,
          message: bills.length > 0 ? 'บิลนี้ไม่มีรายการมัดจำ' : 'ไม่พบบิลนี้',
          list: [],
        };
      }

      const existing = await db
        .collection<DepositBillDoc>(COLLECTIONS.depositBills)
        .find(
          { bill_list_id: { $in: found.map((f) => f.item._id) }, active: DEPOSIT_ACTIVE },
          { projection: { bill_list_id: 1 } },
        )
        .toArray();
      const hasDeposit = new Set(existing.map((e) => String(e.bill_list_id)));

      return {
        success: true,
        list: found.map(({ bill, item }) => ({
          _id: item._id,
          name: item.name ?? '',
          price: toDecimal(item.price_total) ?? toDecimal(item.price),
          invoice_no: bill.invoice_no ?? '',
          hn: bill.hn ?? '',
          patient_name: bill.patient_name ?? '',
          has_deposit: hasDeposit.has(String(item._id)),
        })),
      };
    });
  }

  /** รายการมัดจำไม่แสดง step 2 — insert the missing deposit_bills row, built from the bill. */
  createDeposit(dto: CreateDepositDto, actor: Actor) {
    const itemId = new ObjectId(dto.bill_list_id);

    return this.clinic.run(dto.ip, async (db) => {
      const bill = await db
        .collection<BillDoc>(COLLECTIONS.bills)
        .findOne({ 'list._id': itemId, invoice_no: invoicePrefix(dto.invoice) });
      if (!bill) {
        throw new NotFoundException({
          success: false,
          message: 'ไม่พบรายการนี้ในบิล กรุณาค้นหาใหม่',
        });
      }
      if (bill.status === BILL_STATUS_DELETED) {
        throw new UnprocessableEntityException({
          success: false,
          message: 'บิลนี้ถูกลบแล้ว สร้างรายการมัดจำไม่ได้',
        });
      }
      const item = bill.list?.find((i) => i?._id?.equals(itemId));
      if (!item || item.deposit_status !== DEPOSIT_ITEM) {
        throw new UnprocessableEntityException({
          success: false,
          message: 'รายการนี้ไม่ใช่รายการมัดจำ',
        });
      }

      const deposits = db.collection<DepositBillDoc>(COLLECTIONS.depositBills);
      const existing = await deposits.findOne(
        { bill_list_id: itemId, active: DEPOSIT_ACTIVE },
        { projection: { _id: 1 } },
      );
      if (existing) {
        throw new ConflictException({
          success: false,
          message: 'มีรายการมัดจำนี้อยู่แล้ว ไม่ต้องสร้างซ้ำ',
        });
      }

      // Same shape and field order DreaseV2 writes when a deposit bill is paid.
      const amount =
        toDecimal(item.price_total) ?? toDecimal(item.price) ?? Decimal128.fromString('0');
      const doc: DepositBillDoc = {
        _id: new ObjectId(),
        hn: bill.hn ?? null,
        patient_name: bill.patient_name ?? null,
        name: item.name ?? '',
        deposit_no: '',
        bill_list_id: item._id,
        bill_id: bill._id,
        amount_current: amount,
        amount_defualt: amount,
        active: DEPOSIT_ACTIVE,
        note: null,
        created_at: new Date(),
      };
      await deposits.insertOne(doc);

      await this.log(
        'deposit.create',
        dto.ip,
        doc._id,
        actor,
        null,
        snapshot(doc, bill.invoice_no ?? ''),
      );
      return { success: true, deposit_id: doc._id };
    });
  }

  /** ลบรายการมัดจำ step 1 — active deposits of one HN. */
  searchByHn(dto: SearchDepositsByHnDto) {
    return this.clinic.run(dto.ip, async (db) => {
      const deposits = await db
        .collection<DepositBillDoc>(COLLECTIONS.depositBills)
        .find({ hn: dto.hn, active: DEPOSIT_ACTIVE })
        .sort({ created_at: -1 })
        .limit(MAX_DEPOSITS)
        .toArray();
      const invoices = await this.invoiceMap(db, deposits);

      return {
        success: true,
        deposits: deposits.map((d) => ({
          _id: d._id,
          name: d.name ?? '',
          hn: d.hn ?? '',
          patient_name: d.patient_name ?? '',
          amount_current: d.amount_current ?? null,
          amount_defualt: d.amount_defualt ?? null,
          invoice: invoices.get(String(d.bill_id)) ?? '',
          created_at: d.created_at ?? null,
        })),
      };
    });
  }

  /**
   * ลบรายการมัดจำ step 2 — soft delete (active "1" → "0"), which hides the row
   * from DreaseV2 the same way while keeping it recoverable.
   */
  deleteDeposit(dto: DeleteDepositDto, actor: Actor) {
    const id = new ObjectId(dto.deposit_id);

    return this.clinic.run(dto.ip, async (db) => {
      const before = await db
        .collection<DepositBillDoc>(COLLECTIONS.depositBills)
        .findOneAndUpdate(
          { _id: id, active: DEPOSIT_ACTIVE },
          { $set: { active: DEPOSIT_REMOVED } },
          { returnDocument: 'before' },
        );
      if (!before) throw new NotFoundException({ success: false, message: NOT_FOUND });

      const invoice = await this.invoiceOf(db, before.bill_id);
      const snap = snapshot(before, invoice);
      await this.log('deposit.delete', dto.ip, id, actor, snap, {
        ...snap,
        active: DEPOSIT_REMOVED,
      });
      return { success: true };
    });
  }

  private async invoiceMap(db: Db, deposits: DepositBillDoc[]): Promise<Map<string, string>> {
    const unique = new Map<string, ObjectId>();
    for (const d of deposits) if (d.bill_id) unique.set(String(d.bill_id), d.bill_id);
    const ids = [...unique.values()];
    if (ids.length === 0) return new Map();
    const bills = await db
      .collection<BillDoc>(COLLECTIONS.bills)
      .find({ _id: { $in: ids } }, { projection: { invoice_no: 1 } })
      .toArray();
    return new Map(bills.map((b) => [String(b._id), b.invoice_no ?? '']));
  }

  private async invoiceOf(db: Db, billId: ObjectId | undefined): Promise<string> {
    if (!billId) return '';
    const bill = await db
      .collection<BillDoc>(COLLECTIONS.bills)
      .findOne({ _id: billId }, { projection: { invoice_no: 1 } });
    return bill?.invoice_no ?? '';
  }

  private log(
    action: AuditAction,
    clinicIp: string,
    documentId: ObjectId,
    actor: Actor,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    return this.audit.record({
      action,
      username: actor.user.username,
      clinicIp,
      clinicDb: this.clinic.dbName,
      collectionName: COLLECTIONS.depositBills,
      documentId: String(documentId),
      before,
      after,
      requestIp: actor.requestIp,
    });
  }
}
