import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Decimal128, ObjectId } from 'mongodb';
import { AuditService } from '../audit/audit.service.js';
import { ClinicConnectionService } from '../clinic/clinic-connection.service.js';
import {
  BILL_STATUS_DELETED,
  type BillDoc,
  COLLECTIONS,
  DOCTOR_BILL_ACTIVE,
  type DoctorBillDoc,
} from '../clinic/drease-v2.types.js';
import { decimalText, invoicePrefix } from '../clinic/mongo-values.js';
import type { Actor } from '../common/auth/auth-user.js';
import type { SearchDfDto, UpdateDfDto } from './df.dto.js';

const MAX_ROWS = 100;
const BILL_DELETED = 'บิลนี้ถูกลบแล้ว แก้ DF ไม่ได้';

/** True when both are the same number; a missing value never equals one. */
function isSameAmount(a: unknown, b: Decimal128): boolean {
  const left = decimalText(a);
  if (left === null) return false;
  return Number(left) === Number(b.toString());
}

function toRow(d: DoctorBillDoc) {
  return {
    _id: d._id,
    title: d.title ?? '',
    officer_name: d.officer_name ?? '',
    officer_code: d.officer_code ?? '',
    types: d.types ?? '',
    amount: d.amount ?? null,
    cost_df: d.cost_df ?? null,
    price_total: d.price_total ?? null,
    payment_id: d.payment_id ?? null,
  };
}

/** Plain-JSON copy of a doctorbills row for the audit log, including the payment_id that gets cleared (so it can be restored). */
function snapshot(d: DoctorBillDoc, bill: BillDoc) {
  return {
    invoice: bill.invoice_no ?? '',
    hn: bill.hn ?? null,
    bill_id: String(d.bill_id),
    title: d.title ?? null,
    officer_code: d.officer_code ?? null,
    amount: d.amount ?? null,
    cost_df: decimalText(d.cost_df),
    price_total: decimalText(d.price_total),
    payment_id: d.payment_id ? String(d.payment_id) : null,
  };
}

/**
 * แก้ไข DF: find a bill by HN + Invoice, then set the doctor-fee amount on one of its
 * `doctorbills` rows (`cost_df` and `price_total`) and clear its `payment_id`.
 * (The brief named `price_df`, but no DreaseV2 `doctorbills` document has that field; `price_total` does.)
 */
@Injectable()
export class DfService {
  constructor(
    private readonly clinic: ClinicConnectionService,
    private readonly audit: AuditService,
  ) {}

  /** Step 1: the bill (by HN and Invoice) and its active doctorbills rows. */
  search(dto: SearchDfDto) {
    return this.clinic.run(dto.ip, async (db) => {
      const bills = await db
        .collection<BillDoc>(COLLECTIONS.bills)
        .find(
          { hn: dto.hn, invoice_no: invoicePrefix(dto.invoice) },
          { projection: { invoice_no: 1, hn: 1, patient_name: 1, status: 1 } },
        )
        .sort({ created_at: -1 })
        .limit(2)
        .toArray();

      if (bills.length === 0) {
        return { success: false, message: 'ไม่พบบิลที่ตรงกับ HN และ Invoice นี้', bill: null, rows: [] };
      }
      if (bills.length > 1) {
        return {
          success: false,
          message: 'พบมากกว่า 1 บิล กรุณากรอก Invoice ให้ครบทุกหลัก',
          bill: null,
          rows: [],
        };
      }
      const bill = bills[0];
      if (bill.status === BILL_STATUS_DELETED) {
        return { success: false, message: BILL_DELETED, bill: null, rows: [] };
      }

      const rows = await db
        .collection<DoctorBillDoc>(COLLECTIONS.doctorBills)
        .find({ bill_id: bill._id, status: DOCTOR_BILL_ACTIVE })
        .sort({ order: 1, _id: 1 })
        .limit(MAX_ROWS)
        .toArray();

      return {
        success: true,
        bill: {
          _id: bill._id,
          invoice_no: bill.invoice_no ?? '',
          hn: bill.hn ?? '',
          patient_name: bill.patient_name ?? '',
          status: bill.status ?? '',
        },
        rows: rows.map(toRow),
      };
    });
  }

  /** Step 2: set cost_df and price_total to the given DF, and payment_id to null, on one row of the bill. */
  update(dto: UpdateDfDto, actor: Actor) {
    const billId = new ObjectId(dto.bill_id);
    const rowId = new ObjectId(dto.doctor_bill_id);
    const df = Decimal128.fromString(dto.df);

    return this.clinic.run(dto.ip, async (db) => {
      const bill = await db
        .collection<BillDoc>(COLLECTIONS.bills)
        .findOne({ _id: billId }, { projection: { invoice_no: 1, hn: 1, status: 1 } });
      if (!bill) {
        throw new NotFoundException({ success: false, message: 'ไม่พบบิลนี้ กรุณาค้นหาใหม่' });
      }
      if (bill.status === BILL_STATUS_DELETED) {
        throw new UnprocessableEntityException({ success: false, message: BILL_DELETED });
      }

      const rows = db.collection<DoctorBillDoc>(COLLECTIONS.doctorBills);
      // The row must belong to this bill and still be active.
      const current = await rows.findOne({
        _id: rowId,
        bill_id: billId,
        status: DOCTOR_BILL_ACTIVE,
      });
      if (!current) {
        throw new NotFoundException({
          success: false,
          message: 'ไม่พบรายการ DF นี้ในบิล (อาจถูกยกเลิกไปแล้ว) กรุณาค้นหาใหม่',
        });
      }

      // Nothing to change when the DF already equals the request and no payment link is set.
      // (Compare as numbers: Decimal128 "1250.5" and "1250.50" differ in scale but are equal.)
      if (
        current.payment_id == null &&
        isSameAmount(current.cost_df, df) &&
        isSameAmount(current.price_total, df)
      ) {
        return { success: true, changed: false, row: toRow(current) };
      }

      // Write only if nobody changed the row since it was read.
      const result = await rows.updateOne(
        {
          _id: rowId,
          bill_id: billId,
          status: DOCTOR_BILL_ACTIVE,
          cost_df: current.cost_df ?? null,
          price_total: current.price_total ?? null,
          payment_id: current.payment_id ?? null,
        },
        { $set: { cost_df: df, price_total: df, payment_id: null } },
      );
      if (result.matchedCount === 0) {
        throw new ConflictException({
          success: false,
          message: 'รายการนี้ถูกแก้ไขระหว่างนี้ กรุณาค้นหาใหม่อีกครั้ง',
        });
      }

      const after: DoctorBillDoc = { ...current, cost_df: df, price_total: df, payment_id: null };
      const changed = result.modifiedCount > 0;
      if (changed) {
        await this.audit.record({
          action: 'df.update',
          username: actor.user.username,
          clinicIp: dto.ip,
          clinicDb: this.clinic.dbName,
          collectionName: COLLECTIONS.doctorBills,
          documentId: String(rowId),
          before: snapshot(current, bill),
          after: snapshot(after, bill),
          requestIp: actor.requestIp,
        });
      }
      return { success: true, changed, row: toRow(after) };
    });
  }
}
