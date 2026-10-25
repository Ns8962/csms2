import {
  Coins,
  FileText,
  IdCard,
  Loader2,
  Plug,
  Receipt,
  Search,
  SearchX,
  Trash2,
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
import type { BasicResponse, DepositItem, SearchDepositsResponse } from '../types.ts'

const FIELD =
  'w-1/2 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200'

/** ลบรายการมัดจำ — cancel a deposit (soft delete on the clinic server). */
export function DepositRemove() {
  const [ip, setIp] = useState('')
  const server = useServerCheck(ip)
  const [hn, setHn] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [deposits, setDeposits] = useState<DepositItem[]>([])
  const [selectedId, setSelectedId] = useState('')
  const selected = deposits.find((d) => d._id === selectedId) ?? null

  const changeIp = (value: string) => {
    setIp(value)
    server.reset()
    setDeposits([])
    setSelectedId('')
    setSearched(false)
  }

  const search = async () => {
    if (!hn.trim()) {
      alert('กรุณากรอก HN')
      return
    }
    setSearching(true)
    try {
      const res = await api<SearchDepositsResponse>('/search-deposits', {
        body: { hn: hn.trim(), ip },
      })
      setDeposits(res.success ? res.deposits || [] : [])
    } catch {
      setDeposits([])
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  const remove = async () => {
    if (!selected) {
      alert('กรุณาเลือกรายการที่ต้องการลบ')
      return
    }
    const label = `${selected.name} (HN: ${selected.hn}, Invoice: ${displayInvoice(selected.invoice)})`
    if (!confirm(`ยืนยันลบรายการมัดจำ\n${label}`)) return
    try {
      const res = await api<BasicResponse>('/delete-deposit', {
        body: { deposit_id: selected._id, ip },
      })
      if (res.success) {
        alert('✅ ลบรายการมัดจำสำเร็จ')
        setSelectedId('')
        await search()
      } else {
        alert(res.message || '❌ ไม่สามารถลบรายการมัดจำได้')
      }
    } catch (err) {
      console.error('Delete deposit error:', err)
      alert('❌ เกิดข้อผิดพลาดในการลบรายการมัดจำ')
    }
  }

  return (
    <div className="p-4">
      <PageHeader
        icon={Trash2}
        title="ลบรายการมัดจำ"
        description="ฟังก์ชันสำหรับลบรายการมัดจำ กรณีต้องการยกเลิกรายการนั้น"
      />
      <div className="mb-4">
        <IpPicker ip={ip} setIp={changeIp} />
      </div>
      <ServerStatus state={server.state} checking={server.checking} message={server.message} />

      {server.state === 1 && (
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

      {server.state === 1 && searched && !searching && deposits.length === 0 && (
        <p className="mt-4 inline-flex items-center gap-2 text-gray-400">
          <SearchX className="h-4 w-4 shrink-0" aria-hidden="true" />
          ไม่พบรายการมัดจำของ HN นี้
        </p>
      )}

      {deposits.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-300 mb-3">เลือกรายการมัดจำที่ต้องการลบ</h3>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={FIELD}
          >
            <option value="">-- เลือกรายการ --</option>
            {deposits.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} - {decimalText(d.amount_current)} (Invoice: {displayInvoice(d.invoice)})
              </option>
            ))}
          </select>
          {selected && (
            <div className="mt-4 w-1/2 p-4 bg-gray-800 rounded-lg">
              <InfoRow icon={FileText} label="ชื่อรายการ">
                {selected.name}
              </InfoRow>
              <InfoRow icon={IdCard} label="HN">
                {selected.hn}
              </InfoRow>
              <InfoRow icon={UserRound} label="ชื่อผู้ป่วย">
                {selected.patient_name}
              </InfoRow>
              <p className="flex items-center gap-2 text-blue-400 font-medium">
                <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
                ยอดมัดจำตอนนี้: {decimalText(selected.amount_current)}
              </p>
              <p className="flex items-center gap-2 text-gray-400 text-sm">
                <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
                Invoice: {displayInvoice(selected.invoice)}
              </p>
              <button
                onClick={remove}
                className="mt-4 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                ลบรายการนี้
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
