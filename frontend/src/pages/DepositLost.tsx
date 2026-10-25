import { CircleAlert, FilePlus2, Loader2, Plug, Receipt, Search, Tag } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.ts'
import { IconInput } from '../components/IconInput.tsx'
import { InfoRow } from '../components/InfoRow.tsx'
import { IpPicker } from '../components/IpPicker.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { ServerStatus } from '../components/ServerStatus.tsx'
import { decimalText } from '../format.ts'
import { useServerCheck } from '../hooks/useServerCheck.ts'
import type { BasicResponse, BillDepositItem, SearchBillsResponse } from '../types.ts'

const FIELD =
  'w-1/2 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200'

/** รายการมัดจำไม่แสดง — create the deposit row DreaseV2 failed to create for a paid bill. */
export function DepositLost() {
  const [ip, setIp] = useState('')
  const server = useServerCheck(ip)
  const [invoice, setInvoice] = useState('')
  const [list, setList] = useState<BillDepositItem[]>([])
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState('')
  const [selectedIndex, setSelectedIndex] = useState('')
  const [creating, setCreating] = useState(false)
  const selected = selectedIndex === '' ? null : (list[Number(selectedIndex)] ?? null)

  const changeIp = (value: string) => {
    setIp(value)
    server.reset()
    setList([])
    setSelectedIndex('')
    setNotFound('')
  }

  const search = async () => {
    if (!invoice.trim() || invoice.trim().length < 7) {
      alert('Invoice ไม่ถูกต้อง กรุณากรอกให้ครบ')
      return
    }
    setSearching(true)
    setNotFound('')
    setSelectedIndex('')
    try {
      const res = await api<SearchBillsResponse>('/search-bills', {
        body: { invoice: invoice.trim(), ip },
      })
      if (res.success) {
        setList(res.list || [])
      } else {
        setList([])
        setNotFound(res.message || 'ไม่พบรายการมัดจำ')
      }
    } catch (err) {
      console.error('Search error:', err)
      setList([])
    } finally {
      setSearching(false)
    }
  }

  const create = async () => {
    if (!selected) {
      alert('กรุณาเลือกรายการที่ต้องการสร้างมัดจำ')
      return
    }
    setCreating(true)
    try {
      const res = await api<BasicResponse>('/create-deposit', {
        body: { bill_list_id: selected._id, invoice: invoice.trim(), ip },
      })
      if (res.success) {
        alert('✅ สร้างรายการมัดจำสำเร็จ')
        setSelectedIndex('')
        setList([])
        setInvoice('')
      } else {
        alert(res.message || 'ไม่สามารถสร้างรายการมัดจำได้')
      }
    } catch (err) {
      console.error('Create deposit error:', err)
      alert('เกิดข้อผิดพลาดในการสร้างรายการมัดจำ')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-4">
      <PageHeader
        icon={FilePlus2}
        title="รายการมัดจำไม่แสดง"
        description="ฟังก์ชันสำหรับเพิ่มรายการมัดจำ กรณีระบบไม่สร้างให้ตามบิลที่ลูกค้าซื้อ"
      />
      <div className="mb-4">
        <IpPicker ip={ip} setIp={changeIp} />
      </div>
      <ServerStatus state={server.state} checking={server.checking} message={server.message} />

      {server.state === 1 && (
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

      {notFound && list.length === 0 && (
        <p className="mt-4 inline-flex items-center gap-2 text-gray-400">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {notFound}
        </p>
      )}

      {list.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-300 mb-3">
            เลือกรายการมัดจำที่ซื้อใน bill
          </h3>
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(e.target.value)}
            className={FIELD}
          >
            <option value="">-- เลือกรายการ --</option>
            {list.map((item, i) => (
              <option key={item._id} value={i}>
                {item.name} - {decimalText(item.price)}
                {item.has_deposit ? ' (มีรายการมัดจำแล้ว)' : ''}
              </option>
            ))}
          </select>
          {selected && (
            <div className="w-1/2 mt-4 p-4 bg-gray-800 rounded-lg">
              <InfoRow icon={FilePlus2} label="รายการที่เลือก">
                {selected.name}
              </InfoRow>
              <p className="flex items-center gap-2 text-blue-400 font-medium">
                <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
                ราคา: {decimalText(selected.price)}
              </p>
              <button
                onClick={create}
                disabled={creating}
                className="mt-4 inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                )}
                {creating ? 'กำลังสร้าง...' : 'สร้างรายการมัดจำ'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
