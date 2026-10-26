import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Plug,
  Stethoscope,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import { download } from '../api.ts'
import { IconInput } from '../components/IconInput.tsx'
import { IpPicker } from '../components/IpPicker.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { ServerStatus } from '../components/ServerStatus.tsx'
import { useServerCheck } from '../hooks/useServerCheck.ts'

/** Calendar days in Thai time (UTC+7), as `yyyy-mm-dd`, whatever time zone this browser is set to. */
const THAI_OFFSET_MS = 7 * 3_600_000
const isoDay = (t: number) => new Date(t + THAI_OFFSET_MS).toISOString().slice(0, 10)

/** First day of this month .. today: the usual DF report. */
function defaultRange() {
  const today = isoDay(Date.now())
  return { from: `${today.slice(0, 8)}01`, to: today }
}

const formatNumber = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// `color-scheme: dark` keeps the browser's calendar icon visible on the dark field.
const DATE_FIELD = '[color-scheme:dark]'

type Outcome =
  | { kind: 'done'; filename: string; rows: number; total: number; unreadable: number }
  /** Nothing in the chosen range: a normal result, shown like "not found" on the other pages. */
  | { kind: 'empty'; message: string }
  | { kind: 'error'; message: string }

/** Export DF: doctor-fee lines of one branch between two days, as an Excel file. */
function ExportDf({ onBack }: { onBack: () => void }) {
  const [ip, setIp] = useState('')
  const server = useServerCheck(ip)
  const initial = defaultRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const changeIp = (value: string) => {
    setIp(value)
    server.reset()
    setOutcome(null)
  }

  const rangeError = !from || !to ? 'กรุณาเลือกช่วงวันที่' : from > to ? 'วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด' : ''

  const run = async () => {
    if (busy) return
    if (rangeError) {
      setOutcome({ kind: 'error', message: rangeError })
      return
    }
    setBusy(true)
    setOutcome(null)
    try {
      const res = await download('/export/df', { ip, from, to }, `DF_${ip}_${from}_${to}.xlsx`)
      if (!res.ok) {
        setOutcome({ kind: res.code === 'NO_DATA' ? 'empty' : 'error', message: res.message })
        return
      }
      // Hand the file to the browser's download manager.
      const url = URL.createObjectURL(res.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = res.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setOutcome({
        kind: 'done',
        filename: res.filename,
        rows: res.rows,
        total: res.total,
        unreadable: res.unreadable,
      })
    } catch (err) {
      console.error('DF export error:', err)
      setOutcome({ kind: 'error', message: 'เกิดข้อผิดพลาดในการส่งออก กรุณาลองใหม่' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4">
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition duration-200"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        กลับไปรายการส่งออก
      </button>
      <PageHeader
        icon={Stethoscope}
        title="Export DF"
        description="ดาวน์โหลดรายการ DF ของสาขาตามช่วงวันที่ที่เลือก เป็นไฟล์ Excel (.xlsx)"
      />
      <div className="mb-4">
        <IpPicker ip={ip} setIp={changeIp} />
      </div>
      <ServerStatus state={server.state} checking={server.checking} message={server.message} />

      {server.state === 1 ? (
        <>
          <div className="mb-2 flex flex-wrap gap-4">
            <div>
              <label htmlFor="export-from" className="block text-gray-300 text-sm font-medium mb-2">
                ตั้งแต่วันที่
              </label>
              <IconInput
                id="export-from"
                icon={<CalendarDays className="h-5 w-5" />}
                wrapperClassName="w-56"
                className={DATE_FIELD}
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setOutcome(null)
                }}
              />
            </div>
            <div>
              <label htmlFor="export-to" className="block text-gray-300 text-sm font-medium mb-2">
                ถึงวันที่
              </label>
              <IconInput
                id="export-to"
                icon={<CalendarDays className="h-5 w-5" />}
                wrapperClassName="w-56"
                className={DATE_FIELD}
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value)
                  setOutcome(null)
                }}
              />
            </div>
          </div>
          <p className="mb-4 text-xs text-gray-500">
            นับตามเวลาประเทศไทย (UTC+7) รวมทั้งวันแรกและวันสุดท้าย · รองรับสูงสุด 50,000 รายการต่อไฟล์
          </p>
          <button
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {busy ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลด Excel'}
          </button>
        </>
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

      <div aria-live="polite">
        {outcome?.kind === 'empty' && (
          <p className="mt-4 inline-flex items-center gap-2 text-gray-400">
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {outcome.message}
          </p>
        )}
        {outcome?.kind === 'error' && (
          <p className="mt-4 inline-flex items-start gap-2 text-red-400">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {outcome.message}
          </p>
        )}
        {outcome?.kind === 'done' && (
          <div className="mt-4 max-w-xl rounded-lg bg-gray-800 p-4">
            <p className="inline-flex items-center gap-2 font-medium text-green-400">
              <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              ดาวน์โหลดแล้ว
            </p>
            <p className="mt-2 break-all text-sm text-gray-300">{outcome.filename}</p>
            <p className="mt-1 text-sm text-gray-400">
              {outcome.rows.toLocaleString('en-US')} รายการ · DF รวม {formatNumber(outcome.total)}
            </p>
            {outcome.unreadable > 0 && (
              <p className="mt-3 inline-flex items-start gap-2 text-sm text-yellow-400">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {outcome.unreadable} รายการมีจำนวนเงินที่อ่านเป็นตัวเลขไม่ได้ในฐานข้อมูลสาขา (ช่อง DF ในไฟล์เว้นว่างไว้
                และไม่ถูกรวมในยอดรวม)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

type ExportKey = 'df'

const EXPORTS: { key: ExportKey; title: string; description: string; icon: typeof Stethoscope }[] = [
  {
    key: 'df',
    title: 'Export DF',
    description: 'รายการ DF ของแพทย์ ตามช่วงวันที่ พร้อมรายการและสาขา',
    icon: Stethoscope,
  },
]

/** Export data — the list of reports that can be downloaded as Excel; picking one opens its form. */
export function ExportData() {
  const [selected, setSelected] = useState<ExportKey | null>(null)

  if (selected === 'df') return <ExportDf onBack={() => setSelected(null)} />

  return (
    <div className="p-4">
      <PageHeader
        icon={FileSpreadsheet}
        title="Export data"
        description="เลือกรายงานที่ต้องการดาวน์โหลดเป็นไฟล์ Excel"
      />
      {/* Cards are at least 24rem wide, so Thai descriptions are not squeezed into short lines. */}
      <ul className="grid max-w-4xl gap-4 [grid-template-columns:repeat(auto-fill,minmax(24rem,1fr))]">
        {EXPORTS.map(({ key, title, description, icon: Icon }) => (
          <li key={key}>
            <button
              onClick={() => setSelected(key)}
              className="group flex h-full w-full items-start gap-4 rounded-xl border border-gray-700 bg-gray-800 p-4 text-left transition duration-200 hover:border-blue-500/60 hover:bg-gray-700/60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 ring-1 ring-inset ring-blue-400/20">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-lg font-semibold text-white">{title}</span>
                <span className="mt-1 block text-sm text-gray-400">{description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
