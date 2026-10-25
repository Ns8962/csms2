/**
 * Creates a local, synthetic DreaseV2 clinic database so every CSMS screen can be
 * tried without touching a real branch server.
 *
 *   npm run seed:demo
 *
 * - Drops and recreates the demo clinic DB (default `csms2_demo_clinic`) on localhost only.
 * - Adds "127.0.0.1 — Local demo clinic" to csms2.branches so it shows in the IP picker.
 *
 * All names / HNs below are fake.
 */
import { existsSync } from 'node:fs';
import { Decimal128, MongoClient, ObjectId } from 'mongodb';

if (existsSync('.env')) process.loadEnvFile('.env');

const DEMO_HOST_URI = 'mongodb://127.0.0.1:27017';
const DEMO_DB = process.env.DEMO_CLINIC_DB_NAME || 'csms2_demo_clinic';
const APP_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/csms2';

if (!DEMO_DB.endsWith('_demo_clinic')) {
  // Guard: this script drops the database, so it refuses anything that is not clearly a demo DB.
  console.error(`Refusing to seed "${DEMO_DB}": demo DB name must end with "_demo_clinic".`);
  process.exit(1);
}

const d = (v: string | number) => Decimal128.fromString(String(v));
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

interface ItemSpec {
  name: string;
  price: number;
  types?: string;
  deposit?: boolean;
}

function billItem(spec: ItemSpec, index: number) {
  return {
    _id: new ObjectId(),
    items: null,
    ortherlist: spec.deposit ? new ObjectId() : null,
    other_name: null,
    unit: '',
    label: null,
    detail: '',
    deposit: 0,
    indexof: index + 1,
    types: spec.types ?? 'operative',
    code: `DM${String(index + 1).padStart(5, '0')}`,
    name: spec.name,
    amount: 1,
    price: d(spec.price),
    price_total: d(spec.price),
    price_balance: d(0),
    deposit_status: spec.deposit ? '1' : '0',
    officer: [],
    user: 'demo',
  };
}

function bill(
  invoiceNo: string,
  hn: string,
  patient: string,
  status: string,
  createdDaysAgo: number,
  items: ItemSpec[],
) {
  const list = items.map(billItem);
  const total = items.reduce((sum, i) => sum + i.price, 0);
  const created = daysAgo(createdDaysAgo);
  return {
    _id: new ObjectId(),
    patient_name: patient,
    invoice_branch_no: invoiceNo,
    approve_del_state: false,
    status,
    usecourse: null,
    old_bill: false,
    pay_id: new ObjectId(),
    hn,
    invoice_no: invoiceNo,
    visitdate: created,
    list,
    price_ex_vat: d(total),
    price_vat: d(0),
    price_total: d(total),
    price_total_balance: d(0),
    branch_name: 'สาขาทดสอบ (demo)',
    branch_code: '01',
    created_at: created,
    updated_at: created,
  };
}

function depositFor(b: ReturnType<typeof bill>, itemIndex: number, current: number) {
  const item = b.list[itemIndex];
  return {
    _id: new ObjectId(),
    hn: b.hn,
    patient_name: b.patient_name,
    name: item.name,
    deposit_no: '',
    bill_list_id: item._id,
    bill_id: b._id,
    amount_current: d(current),
    amount_defualt: item.price_total,
    active: '1',
    note: null,
    created_at: new Date(b.created_at.getTime() + 6_000),
  };
}

const P1 = { hn: 'HN6900001', name: 'สมชาย ทดสอบระบบ' };
const P2 = { hn: 'HN6900002', name: 'สมหญิง ตัวอย่างข้อมูล' };

// 1) คืนยอดมัดจำ: 5,000 deposit, 888 already used on bill 6900004 which was then deleted.
const billA = bill('690000123', P1.hn, P1.name, 'full_paid', 20, [
  { name: 'มัดจำคอร์สเลเซอร์ 5,000', price: 5000, deposit: true },
]);
const billUsed = bill('690000489', P1.hn, P1.name, 'delete', 5, [
  { name: 'เลเซอร์หน้าใส (ใช้มัดจำ)', price: 888 },
]);
// 2) รายการมัดจำไม่แสดง: deposit item paid but no deposit_bills row.
const billB = bill('690000245', P1.hn, P1.name, 'full_paid', 3, [
  { name: 'มัดจำทรีตเมนต์หน้าใส 3,000', price: 3000, deposit: true },
  { name: 'วิตามินซี 1000mg', price: 450, types: 'medicine' },
]);
// 3) ลบรายการมัดจำ: an active deposit to remove.
const billC = bill('690000367', P2.hn, P2.name, 'full_paid', 10, [
  { name: 'มัดจำแพ็กเกจฟิลเลอร์ 2,000', price: 2000, deposit: true },
]);
// Edge cases: "C" course invoice (must not match 6900001), 7-digit legacy invoice, deleted bill.
const billCourse = bill('C690000140', P2.hn, P2.name, 'full_paid', 15, [
  { name: 'มัดจำคอร์ส (บิล C)', price: 1500, deposit: true },
]);
const billLegacy = bill('6900005', P2.hn, P2.name, 'full_paid', 2, [
  { name: 'มัดจำ (เลขบิล 7 หลัก)', price: 1000, deposit: true },
]);
const billDeleted = bill('690000611', P2.hn, P2.name, 'delete', 1, [
  { name: 'มัดจำในบิลที่ถูกลบ', price: 700, deposit: true },
]);

const depositA = depositFor(billA, 0, 4112);
const depositC = depositFor(billC, 0, 2000);
const depositCourse = depositFor(billCourse, 0, 1500);

// แก้ไข DF: doctorbills rows shaped like DreaseV2's (hn is null, amounts are Decimal128, payment_id an ObjectId).
function doctorBill(
  b: ReturnType<typeof bill>,
  order: number,
  title: string,
  doctor: { code: string; name: string },
  df: number,
  extra: { status?: string; paid?: boolean; amount?: number } = {},
) {
  const amount = extra.amount ?? 1;
  return {
    _id: new ObjectId(),
    course: { is_use_course: false, course_id: null, course_use_count: 0, course_list_use_count: 0, use_course_amout: 0 },
    hn: null,
    status: extra.status ?? 'active',
    discount: 0,
    amount,
    payment_id: extra.paid ? new ObjectId() : null,
    listheal_id: new ObjectId(),
    lab_list_id: null,
    bill_id: b._id,
    types: 'operative',
    order,
    officer_code: doctor.code,
    officer_name: doctor.name,
    title,
    priceof: d(1000 * amount),
    priceof_heal: d(1000 * amount),
    cost_df: d(df),
    price_total: d(df),
    created_at: new Date(b.created_at.getTime() + 1_000),
    real_time_created: new Date(b.created_at.getTime() + 1_245),
  };
}
const DR1 = { code: '1011', name: 'ทพญ.ทดสอบ หนึ่ง' };
const DR2 = { code: '1012', name: 'ทพ.ทดสอบ สอง' };

// One DF row with DF 0 (the case this menu exists for), on a bill with a single service.
const billDf1 = bill('690000700', P1.hn, P1.name, 'full_paid', 4, [{ name: 'เกลารากฟัน / Root Planing', price: 1000 }]);
// Several DF rows: one already paid out (payment_id set), one cancelled, one at 0.
const billDf3 = bill('690000755', P2.hn, P2.name, 'full_paid', 6, [
  { name: 'อุดฟัน', price: 1000 },
  { name: 'ขูดหินปูน', price: 1000 },
  { name: 'ถอนฟัน', price: 1000 },
]);
// A deleted bill with a DF row: it must not be editable.
const billDfDeleted = bill('690000800', P1.hn, P1.name, 'delete', 2, [{ name: 'ฟอกสีฟัน', price: 1000 }]);

const doctorBills = [
  doctorBill(billDf1, 1, 'เกลารากฟัน / Root Planing', DR1, 0),
  doctorBill(billDf3, 1, 'อุดฟัน', DR1, 300, { paid: true }),
  doctorBill(billDf3, 2, 'ขูดหินปูน', DR2, 0),
  doctorBill(billDf3, 3, 'ถอนฟัน (ยกเลิก)', DR2, 500, { status: 'delete' }),
  doctorBill(billDfDeleted, 1, 'ฟอกสีฟัน', DR1, 0),
];

async function main() {
  const demo = new MongoClient(DEMO_HOST_URI, { serverSelectionTimeoutMS: 5000 });
  const app = new MongoClient(APP_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([demo.connect(), app.connect()]);
  try {
    const db = demo.db(DEMO_DB);
    await db.dropDatabase();

    await db.collection('bills').insertMany([
      billA,
      billUsed,
      billB,
      billC,
      billCourse,
      billLegacy,
      billDeleted,
      billDf1,
      billDf3,
      billDfDeleted,
    ]);
    await db.collection('bills').createIndexes([
      { key: { invoice_no: 1 } },
      { key: { hn: 1, status: 1 } },
      { key: { created_at: 1, status: 1 } },
    ]);

    await db.collection('deposit_bills').insertMany([depositA, depositC, depositCourse]);
    await db.collection('deposit_bills').createIndexes([
      { key: { hn: 1, active: 1 } },
      { key: { active: 1, created_at: -1 } },
    ]);

    await db.collection('deposit_bill_logs').insertOne({
      hn: null,
      patient_name: null,
      name: depositA.name,
      deposit_no: null,
      bill_list_id: depositA.bill_list_id,
      bill_id: depositA.bill_id,
      deposit_bill_id: depositA._id,
      payment_id: billUsed.pay_id,
      amount_current: d(4112),
      amount_before_use: d(5000),
      created_at: billUsed.created_at,
    });
    await db.collection('deposit_bill_logs').createIndexes([
      { key: { deposit_bill_id: 1 } },
      { key: { payment_id: 1 } },
    ]);

    await db.collection('doctorbills').insertMany(doctorBills);
    await db.collection('doctorbills').createIndexes([{ key: { bill_id: 1 } }]);

    // Make the demo server selectable in the IP picker.
    const branches = app.db().collection('branches');
    const label = `Local demo clinic (${DEMO_DB})`;
    const exists = await branches.findOne({ ip: '127.0.0.1', label });
    if (!exists) {
      const now = new Date();
      await branches.insertOne({
        ip: '127.0.0.1',
        label,
        sort: -1,
        syncId: 'manual',
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`Seeded ${DEMO_DB}: 10 bills, 3 deposit_bills, 1 deposit_bill_logs, ${doctorBills.length} doctorbills`);
    console.log(`Branch "127.0.0.1 — ${label}" is in ${app.db().databaseName}.branches`);
    console.log('Try: HN6900001 / Invoice 6900001 (return), Invoice 6900002 (missing), HN6900002 (remove)');
    console.log('     แก้ไข DF: HN6900001 + 690000700 (one row), HN6900002 + 690000755 (several rows), HN6900001 + 690000800 (deleted bill)');
  } finally {
    await Promise.all([demo.close(), app.close()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
