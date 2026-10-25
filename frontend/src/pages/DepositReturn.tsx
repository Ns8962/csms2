import { Coins, IdCard, Loader2, Plug, Receipt, Save, Search, Undo2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.ts'
import { IconInput } from '../components/IconInput.tsx'
import { IpPicker } from '../components/IpPicker.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { ServerStatus } from '../components/ServerStatus.tsx'
import { decimalText, displayInvoice } from '../format.ts'
import { useServerCheck } from '../hooks/useServerCheck.ts'
import type { BasicResponse, ReturnSearchItem, ReturnSearchResponse } from '../types.ts'

const INPUT =
  'w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200'

/** คืนยอดมัดจำ — restore a deposit balance after the receipt that used it was deleted. */
export function DepositReturn() {
  const [ip, setIp] = useState('')
  const server = useServerCheck(ip)
  const [hn, setHn] = useState('')
  const [invoice, setInvoice] = useState('')
  const [results, setResults] = useState<ReturnSearchItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState('')
  const [amountCurrent, setAmountCurrent] = useState('')
  const selected = selectedIndex === '' ? null : (results[Number(selectedIndex)] ?? null)

  const changeIp = (value: string) => {
    setIp(value)
    server.reset()
    setResults([])
    setSelectedIndex('')
    setAmountCurrent('')
  }

  const select = (value: string) => {
    setSelectedIndex(value)
    const item = value === '' ? null : results[Number(value)]
    setAmountCurrent(item ? decimalText(item.amount_current) : '')
  }

  const search = async () => {
    try {
      const res = await api<ReturnSearchResponse>('/search', { body: { hn, invoice, ip } })
      if (res.success === false && res.message) alert(res.message)
      setResults(res.results || [])
      setSelectedIndex('')
      setAmountCurrent('')
    } catch (err) {
      console.error(err)
      setResults([])
    }
  }

  const update = async () => {
    if (!selected || !amountCurrent) {
      alert('กรุณาเลือกรายการและกรอกมูลค่าปัจจุบัน')
      return
    }
    try {
      const res = await api<BasicResponse>('/update', {
        body: { id: selected._id, amountCurrent, ip },
      })
      if (res.success) {
        alert('✅ อัปเดตข้อมูลสำเร็จ')
        setResults((prev) =>
          prev.map((r) =>
            r._id === selected._id ? { ...r, amount_current: amountCurrent } : r,
          ),
        )
      } else {
        alert(res.message ? `❌ ${res.message}` : '❌ อัปเดตข้อมูลไม่สำเร็จ')
      }
    } catch (err) {
      console.error(err)
      alert('❌ เกิดข้อผิดพลาด')
    }
  }

  return (
    <div className="p-4">
      <PageHeader
        icon={Undo2}
        title="คืนยอดมัดจำ"
        description="ฟังก์ชันสำหรับคืนยอดมัดจำ กรณีลูกค้าลบใบเสร็จที่ใช้มัดจำแล้วต้องการคืนยอด"
      />
      <div className="mb-4">
        <IpPicker ip={ip} setIp={changeIp} />
      </div>
      <ServerStatus state={server.state} checking={server.checking} message={server.message} />

      {server.state === 1 && (
        <div className="flex space-x-8 mb-4">
          <div className="flex-1">
            <div className="mb-4">
              <label className="block text-gray-300 text-sm font-medium mb-2">HN</label>
              <IconInput
                icon={<IdCard className="h-5 w-5" />}
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
                type="text"
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                placeholder="Enter Invoice"
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="mb-4">
              <label className="block text-gray-300 text-sm font-medium mb-2">รายการมัดจำ</label>
              <select
                value={selectedIndex}
                onChange={(e) => select(e.target.value)}
                className={INPUT}
                disabled={results.length === 0}
              >
                <option value="">
                  {results.length === 0 ? 'No results available' : 'Select...'}
                </option>
                {results.map((d, i) => (
                  <option key={d._id} value={i}>
                    {i + 1}. {displayInvoice(d.invoice_no)} - {d.deposit_name}
                  </option>
                ))}
              </select>
            </div>
            {selected && (
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    มูลค่าที่ซื้อ
                  </label>
                  <IconInput
                    icon={<Wallet className="h-5 w-5" />}
                    type="text"
                    value={decimalText(selected.amount_defualt)}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    มูลค่าตอนนี้
                  </label>
                  <IconInput
                    icon={<Coins className="h-5 w-5" />}
                    type="text"
                    inputMode="decimal"
                    value={amountCurrent}
                    onChange={(e) => setAmountCurrent(e.target.value)}
                  />
                </div>
                <button
                  onClick={update}
                  className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  แก้ไขมูลค่ามัดจำ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {server.state === 1 ? (
        <button
          onClick={search}
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          ค้นหา
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
    </div>
  )
}
