import { Building2, ListFilter, MapPin, Network, RefreshCw, Search, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.ts'
import type { Branch, IpListResponse } from '../types.ts'
import { IconInput } from './IconInput.tsx'

interface Props {
  ip: string
  setIp: (ip: string) => void
}

/** IP input + "เลือกจากรายการ" modal fed by the branch list (Google Sheet). */
export function IpPicker({ ip, setIp }: Props) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Branch[]>([])
  const [selectedLabel, setSelectedLabel] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api<IpListResponse>('/ip-list')
      setList(res.list || [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  const reload = async () => {
    setLoading(true)
    try {
      const res = await api<IpListResponse>('/refresh-ip-list', { method: 'POST' })
      if (res.list) setList(res.list)
      if (res.success === false && res.message) alert(res.message)
    } catch {
      // keep the current list
    } finally {
      setLoading(false)
    }
  }

  const openModal = () => {
    setOpen(true)
    setQuery('')
    if (list.length === 0) void load()
  }

  const choose = (branch: Branch) => {
    setIp(branch.ip)
    setSelectedLabel(branch.label)
    setOpen(false)
  }

  const q = query.toLowerCase()
  const filtered = list.filter(
    (b) => b.label.toLowerCase().includes(q) || b.ip.includes(query),
  )

  return (
    <div className="mb-4">
      <label className="block text-gray-300 text-sm font-medium mb-2">IP Address</label>
      <div className="flex items-center space-x-2">
        <IconInput
          icon={<Network className="h-5 w-5" />}
          wrapperClassName="w-1/4"
          type="text"
          value={ip}
          onChange={(e) => {
            setIp(e.target.value)
            setSelectedLabel('')
          }}
          placeholder="Enter IP address"
        />
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition duration-200 whitespace-nowrap"
        >
          <ListFilter className="h-5 w-5" aria-hidden="true" />
          เลือกจากรายการ
        </button>
      </div>
      {selectedLabel && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-green-400">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          เลือกอยู่: <span className="font-medium">{selectedLabel}</span>
        </p>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-blue-400">
                <Building2 className="h-5 w-5" aria-hidden="true" />
                เลือกรายการ IP
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-700 hover:text-white transition duration-200"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <IconInput
              icon={<Search className="h-5 w-5" />}
              wrapperClassName="mb-3"
              className="!py-2"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ หรือ IP..."
              autoFocus
            />
            <div className="overflow-y-auto flex-1 min-h-[200px]">
              {loading ? (
                <p className="text-gray-400 text-center py-6">กำลังโหลด...</p>
              ) : filtered.length === 0 ? (
                <p className="text-gray-400 text-center py-6">ไม่พบรายการ</p>
              ) : (
                <ul className="divide-y divide-gray-700">
                  {filtered.map((b, i) => (
                    <li key={`${b.ip}-${i}`}>
                      <button
                        type="button"
                        onClick={() => choose(b)}
                        className="w-full flex items-center gap-3 text-left px-3 py-2 hover:bg-gray-700 rounded transition duration-150"
                      >
                        <Building2 className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                        <span className="text-white">{b.label || '(ไม่มีชื่อ)'}</span>
                        <span className="text-gray-400 text-sm ml-auto">{b.ip}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">ทั้งหมด {list.length} รายการ</span>
              <button
                onClick={reload}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                โหลดรายการใหม่จาก Google Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
