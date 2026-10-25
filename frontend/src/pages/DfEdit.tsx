import {
  CircleAlert,
  Coins,
  IdCard,
  Loader2,
  Plug,
  Receipt,
  Save,
  Search,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.ts'
import { IconInput } from '../components/IconInput.tsx'
import { InfoRow } from '../components/InfoRow.tsx'
import { IpPicker } from '../components/IpPicker.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { ServerStatus } from '../components/ServerStatus.tsx'
import { decimalText, displayInvoice } from '../format.ts'
import { useServerCheck } from '../hooks/useServerCheck.ts'
import type { DfBill, DfRow, DfSearchResponse, DfUpdateResponse } from '../types.ts'

const FIELD =
  'w-1/2 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200'

// Same rule the server enforces: a non-negative number with at most 2 decimals.
const DF_PATTERN = /^\d{1,12}(\.\d{1,2})?$/

const rowLabel = (r: DfRow, i: number) =>
  `${i + 1}. ${r.title || '(ไม่มีชื่อรายการ)'}${r.officer_name ? ` - ${r.officer_name}` : ''} (DF ตอนนี้ ${decimalText(r.cost_df) || '0'})`

/** แก้ไข DF — set the doctor-fee amount of a bill's doctorbills row and release its DF payment link. */
export function DfEdit() {
  const [ip, setIp] = useState('')
  const server = useServerCheck(ip)
  const [hn, setHn] = useState('')
  const [invoice, setInvoice] = useState('')
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const [bill, setBill] = useState<DfBill | null>(null)
  const [rows, setRows] = useState<DfRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [df, setDf] = useState('0')
  const [saving, setSaving] = useState(false)

  // A bill with a single DF row is selected automatically, so the common case is just: enter DF, save.
  const selected = rows.find((r) => r._id === selectedId) ?? (rows.length === 1 ? rows[0] : null)

  const clearResult = () => {
    setBill(null)
    setRows([])
    setSelectedId('')
    setDf('0')
    setMessage('')
  }

  const changeIp = (value: string) => {
    setIp(value)
    server.reset()
    clearResult()
  }

  const search = async () => {
    if (!hn.trim()) {
      alert('กรุณากรอก HN')
      return
    }
    if (invoice.trim().length < 7) {
      alert('Invoice ไม่ถูกต้อง กรุณากรอกให้ครบ')
      return
    }
    setSearching(true)
    clearResult()
    try {
      const res = await api<DfSearchResponse>('/df/search', {
        body: { hn: hn.trim(), invoice: invoice.trim(), ip },
      })
      if (res.success && res.bill) {
        setBill(res.bill)
        setRows(res.rows ?? [])
        if (!res.rows?.length) setMessage('บิลนี้ไม่มีรายการ DF')
      } else {
        setMessage(res.message || 'ไม่พบข้อมูล')
      }
    } catch (err) {
      console.error('DF search error:', err)
      setMessage('เกิดข้อผิดพลาดในการค้นหา')
    } finally {
      setSearching(false)
    }
  }

  const save = async () => {
    if (!bill || !selected) {
      alert('กรุณาเลือกรายการ DF')
      return
    }
    if (!DF_PATTERN.test(df.trim())) {
      alert('จำนวน DF ต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง')
      return
    }
    const before = decimalText(selected.cost_df) || '0'
    const lines = [
      'ยืนยันบันทึก DF',
      `${selected.title}${selected.officer_name ? ` (${selected.officer_name})` : ''}`,
      `Invoice: ${displayInvoice(bill.invoice_no)}  HN: ${bill.hn}`,
      `DF: ${before} → ${df.trim()}`,
    ]
    if (selected.payment_id) {
      lines.push('การบันทึกจะล้าง payment_id ของรายการนี้ (ผูกกับใบชำระเงินของบิล)')
    }
    if (!confirm(lines.join('\n'))) return

    setSaving(true)
    try {
      const res = await api<DfUpdateResponse>('/df/update', {
        body: { bill_id: bill._id, doctor_bill_id: selected._id, df: df.trim(), ip },
      })
      if (res.success && res.row) {
        const updated = res.row
        setRows((prev) => prev.map((r) => (r._id === updated._id ? updated : r)))
        alert(res.changed ? '✅ บันทึก DF สำเร็จ' : 'ค่า DF เท่าเดิมอยู่แล้ว ไม่มีการเปลี่ยนแปลง')
      } else {
        alert(res.message ? `❌ ${res.message}` : '❌ บันทึก DF ไม่สำเร็จ')
      }
    } catch (err) {
      console.error('DF update error:', err)
      alert('❌ เกิดข้อผิดพลาดในการบันทึก DF')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4">
      <PageHeader
        icon={Stethoscope}
        title="แก้ไข DF"
        description="ฟังก์ชันสำหรับแก้ไขจำนวน DF ของบิล กรณีค่า DF ในบิลไม่ถูกต้อง"
      />
      <div className="mb-4">
        <IpPicker ip={ip} setIp={changeIp} />
      </div>
      <ServerStatus state={server.state} checking={server.checking} message={server.message} />

      {server.state === 1 && (
        <>
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">HN</label>
            <IconInput
              icon={<IdCard className="h-5 w-5" />}
              wrapperClassName="w-1/2"
              type="text"
              value={hn}
              onChange={(e) => setHn(e.target.value)}
              placeholder="Enter HN"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">Invoice</label>
            <IconInput
              icon={<Receipt className="h-5 w-5" />}
              wrapperClassName="w-1/2"
              type="text"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="Enter Invoice"
            />
          </div>
        </>
      )}

      {server.state === 1 ? (
        <button
          onClick={search}
          disabled={searching}
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          {searching ? 'กำลังค้นหา...' : 'ค้นหา'}
        </button>
      ) : (
        <button
          onClick={server.check}
          disabled={server.checking}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
        >
          {server.checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plug className="h-4 w-4" aria-hidden="true" />
          )}
          Check
        </button>
      )}

      {message && (
        <p className="mt-4 inline-flex items-center gap-2 text-gray-400">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {message}
        </p>
      )}

      {bill && rows.length > 0 && (
        <div className="mt-6">
          <div className="w-1/2 p-4 mb-4 bg-gray-800 rounded-lg">
            <InfoRow icon={Receipt} label="Invoice">
              {displayInvoice(bill.invoice_no)}
            </InfoRow>
            <InfoRow icon={IdCard} label="HN">
              {bill.hn}
            </InfoRow>
            <InfoRow icon={UserRound} label="ชื่อผู้ป่วย">
              {bill.patient_name}
            </InfoRow>
          </div>

          {rows.length > 1 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-300 mb-3">เลือกรายการ DF ที่ต้องการแก้ไข</h3>
              <select
                value={selected?._id ?? ''}
                onChange={(e) => {
                  setSelectedId(e.target.value)
                  setDf('0')
                }}
                className={FIELD}
              >
                <option value="">-- เลือกรายการ --</option>
                {rows.map((r, i) => (
                  <option key={r._id} value={r._id}>
                    {rowLabel(r, i)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected && (
            <div className="w-1/2 p-4 bg-gray-800 rounded-lg">
              <InfoRow icon={Stethoscope} label="รายการ">
                {selected.title}
              </InfoRow>
              {selected.officer_name && (
                <InfoRow icon={UserRound} label="แพทย์">
                  {selected.officer_name}
                </InfoRow>
              )}
              <p className="flex items-center gap-2 text-blue-400 font-medium">
                <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
                DF ตอนนี้: {decimalText(selected.cost_df) || '0'}
              </p>

              <label className="block text-gray-300 text-sm font-medium mt-4 mb-2">จำนวน DF</label>
              <IconInput
                icon={<Coins className="h-5 w-5" />}
                type="number"
                min="0"
                step="0.01"
                value={df}
                onChange={(e) => setDf(e.target.value)}
              />
              <p className="mt-2 text-xs text-gray-500">
                บันทึกแล้วจะตั้ง cost_df และ price_total เป็นจำนวนนี้ และล้าง payment_id
              </p>
              <button
                onClick={save}
                disabled={saving}
                className="mt-4 inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
