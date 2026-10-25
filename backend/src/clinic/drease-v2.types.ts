import type { Decimal128, ObjectId } from 'mongodb';

/**
 * The parts of the DreaseV2 clinic database (MongoDB) that CSMS reads/writes.
 * Field names are copied as-is from the clinic schema, including the
 * `amount_defualt` typo, so documents stay compatible with DreaseV2.
 */

/** "1" = active, "0" = removed (CSMS soft delete). Stored as strings in DreaseV2. */
export const DEPOSIT_ACTIVE = '1';
export const DEPOSIT_REMOVED = '0';

/** `bills.list[].deposit_status === "1"` marks a line item that is a deposit purchase. */
export const DEPOSIT_ITEM = '1';

export const BILL_STATUS_DELETED = 'delete';

/** `doctorbills.status`: "active" rows count; "delete" rows are cancelled and must not be edited. */
export const DOCTOR_BILL_ACTIVE = 'active';

export const COLLECTIONS = {
  bills: 'bills',
  depositBills: 'deposit_bills',
  doctorBills: 'doctorbills',
} as const;

export interface BillListItem {
  _id: ObjectId;
  types?: string;
  code?: string;
  name?: string;
  amount?: number;
  price?: Decimal128 | number;
  price_total?: Decimal128 | number;
  price_balance?: Decimal128 | number;
  deposit_status?: string;
}

export interface BillDoc {
  _id: ObjectId;
  invoice_no?: string;
  invoice_branch_no?: string | null;
  hn?: string;
  patient_name?: string;
  status?: string;
  list?: BillListItem[];
  created_at?: Date;
}

/** One doctor-fee (DF) line of a bill. `cost_df` and `price_total` carry the DF amount. */
export interface DoctorBillDoc {
  _id: ObjectId;
  bill_id: ObjectId;
  status?: string;
  types?: string;
  title?: string;
  officer_code?: string;
  officer_name?: string;
  amount?: number;
  order?: number;
  cost_df?: Decimal128 | number | null;
  price_total?: Decimal128 | number | null;
  /**
   * Id of the bill's `payment_summary` document (not a doctor-fee payout: it is set on every active row
   * in the databases checked). CSMS clears it when the DF is edited, as requested.
   */
  payment_id?: ObjectId | null;
}

export interface DepositBillDoc {
  _id: ObjectId;
  hn: string | null;
  patient_name: string | null;
  name: string;
  deposit_no: string;
  bill_list_id: ObjectId;
  bill_id: ObjectId;
  amount_current: Decimal128;
  amount_defualt: Decimal128;
  active: string;
  note: string | null;
  created_at: Date;
}
