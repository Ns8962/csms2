/** Decimal128 as the API serialises it: `{ "$numberDecimal": "5000" }`. */
export type Decimal = { $numberDecimal: string } | string | number | null | undefined

export interface BasicResponse {
  success?: boolean
  message?: string
  /** Set by the api() wrapper on non-2xx responses. */
  statusCode?: number
}

export interface LoginResponse extends BasicResponse {
  accessToken?: string
  user?: { username: string }
}

export interface Branch {
  ip: string
  label: string
}

export interface IpListResponse extends BasicResponse {
  list?: Branch[]
  updatedAt?: string | null
}

/** A branch seen on the bills of a clinic server. The pair (code, name) is the identity: codes are reused. */
export interface ExportBranch {
  code: string
  name: string
}

export interface ExportBranchesResponse extends BasicResponse {
  branches?: ExportBranch[]
}

export interface ConnectResponse extends BasicResponse {
  status?: 'ready' | 'not_ready'
}

/** POST /search (คืนยอดมัดจำ) */
export interface ReturnSearchItem {
  _id: string
  invoice_no: string
  deposit_name: string
  amount_defualt: Decimal
  amount_current: Decimal
  hn?: string
  patient_name?: string
}

export interface ReturnSearchResponse extends BasicResponse {
  results?: ReturnSearchItem[]
}

/** POST /search-bills (รายการมัดจำไม่แสดง) */
export interface BillDepositItem {
  _id: string
  name: string
  price: Decimal
  invoice_no?: string
  has_deposit?: boolean
}

export interface SearchBillsResponse extends BasicResponse {
  list?: BillDepositItem[]
}

/** POST /search-deposits (ลบรายการมัดจำ) */
export interface DepositItem {
  _id: string
  name: string
  hn: string
  patient_name: string
  amount_current: Decimal
  invoice: string
}

export interface SearchDepositsResponse extends BasicResponse {
  deposits?: DepositItem[]
}

/** POST /df/search (แก้ไข DF) */
export interface DfBill {
  _id: string
  invoice_no: string
  hn: string
  patient_name: string
  status: string
}

/** One active `doctorbills` row of the bill. `payment_id` is set once the DF was paid out. */
export interface DfRow {
  _id: string
  title: string
  officer_name: string
  officer_code: string
  types: string
  amount: number | null
  cost_df: Decimal
  price_total: Decimal
  payment_id: string | null
}

export interface DfSearchResponse extends BasicResponse {
  bill?: DfBill | null
  rows?: DfRow[]
}

export interface DfUpdateResponse extends BasicResponse {
  changed?: boolean
  row?: DfRow
}
