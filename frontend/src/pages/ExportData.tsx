import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  type LucideIcon,
  Plug,
  RefreshCw,
  Stethoscope,
  Ticket,
  TriangleAlert,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { api, download, type DownloadResult } from '../api.ts'
import { IconInput } from '../components/IconInput.tsx'
import { IpPicker } from '../components/IpPicker.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { ServerStatus } from '../components/ServerStatus.tsx'
import { useServerCheck } from '../hooks/useServerCheck.ts'
import type { ExportBranch, ExportBranchesResponse } from '../types.ts'

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

const FIELD =
  'w-full max-w-xl px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200'

// `color-scheme: dark` keeps the browser's calendar icon visible on the dark field.
const DATE_FIELD = '[color-scheme:dark]'

type Outcome =
  | { kind: 'done'; filename: string; summary: string; notes: string[] }
  /** Nothing matched: a normal result, shown like "not found" on the other pages. */
  | { kind: 'empty'; message: string }
  | { kind: 'error'; message: string }

/** Hands a downloaded file to the browser's download manager. */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Runs one export request and turns its answer into something to show. A successful answer is saved as a
 * file; `summarize` says what the page reports about it.
 */
async function runExport(
  request: () => Promise<DownloadResult>,
  summarize: (res: Extract<DownloadResult, { ok: true }>) => { summary: string; notes: string[] },
): Promise<Outcome> {
  try {
    const res = await request()
    if (!res.ok) return { kind: res.code === 'NO_DATA' ? 'empty' : 'error', message: res.message }
    saveFile(res.blob, res.filename)
    return { kind: 'done', filename: res.filename, ...summarize(res) }
  } catch (err) {
    console.error('Export error:', err)
    return { kind: 'error', message: 'เกิดข้อผิดพลาดในการส่งออก กรุณาลองใหม่' }
  }
}

function OutcomeView({ outcome }: { outcome: Outcome | null }) {
  return (
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
          <p className="mt-1 text-sm text-gray-400">{outcome.summary}</p>
          {outcome.notes.map((note) => (
            <p key={note} className="mt-3 inline-flex items-start gap-2 text-sm text-yellow-400">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition duration-200"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      กลับไปรายการส่งออก
    </button>
  )
}

function CheckButton({ onClick, checking }: { onClick: () => void; checking: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={checking}
      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
    >
      {checking ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Plug className="h-4 w-4" aria-hidden="true" />
      )}
      Check
    </button>
  )
}

function DownloadButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
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
  )
}

function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-gray-300 text-sm font-medium mb-2">
        {label}
      </label>
      <IconInput
        id={id}
        icon={<CalendarDays className="h-5 w-5" />}
        wrapperClassName="w-56"
        className={DATE_FIELD}
        type="date"
        value={value}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

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
      setOutcome(
        await runExport(
          () => download('/export/df', { ip, from, to }, `DF_${ip}_${from}_${to}.xlsx`),
          (res) => ({
            summary: `${res.rows.toLocaleString('en-US')} รายการ · DF รวม ${formatNumber(res.total)}`,
            notes:
              res.unreadable > 0
                ? [
                    `${res.unreadable} รายการมีจำนวนเงินที่อ่านเป็นตัวเลขไม่ได้ในฐานข้อมูลสาขา (ช่อง DF ในไฟล์เว้นว่างไว้ และไม่ถูกรวมในยอดรวม)`,
                  ]
                : [],
          }),
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4">
      <BackLink onBack={onBack} />
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
            <DateField
              id="export-from"
              label="ตั้งแต่วันที่"
              value={from}
              max={to}
              onChange={(v) => {
                setFrom(v)
                setOutcome(null)
              }}
            />
            <DateField
              id="export-to"
              label="ถึงวันที่"
              value={to}
              min={from}
              onChange={(v) => {
                setTo(v)
                setOutcome(null)
              }}
            />
          </div>
          <p className="mb-4 text-xs text-gray-500">
            นับตามเวลาประเทศไทย (UTC+7) รวมทั้งวันแรกและวันสุดท้าย · รองรับสูงสุด 50,000 รายการต่อไฟล์
          </p>
          <DownloadButton onClick={run} busy={busy} />
        </>
      ) : (
        <CheckButton onClick={server.check} checking={server.checking} />
      )}

      <OutcomeView outcome={outcome} />
    </div>
  )
}

type BranchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; branches: ExportBranch[] }
  | { kind: 'failed'; message: string }

/** `code` and `name` are sent together as the select value: the same code can belong to different branches. */
const branchValue = (b: ExportBranch) => JSON.stringify([b.code, b.name])
const branchLabel = (b: ExportBranch) => `${b.name || '(ไม่มีชื่อ)'} (${b.code})`

/** Export คอร์สคงเหลือ: active purchased courses of one branch (or all), one row per treatment, as an Excel file. */
function ExportCourses({ onBack }: { onBack: () => void }) {
  const [ip, setIp] = useState('')
  const server = useServerCheck(ip)
  const [branches, setBranches] = useState<BranchState>({ kind: 'idle' })
  const [branch, setBranch] = useState('') // '' = all branches, else branchValue()
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const changeIp = (value: string) => {
    setIp(value)
    server.reset()
    setBranches({ kind: 'idle' })
    setBranch('')
    setOutcome(null)
  }

  const loadBranches = async () => {
    setBranches({ kind: 'loading' })
    try {
      const res = await api<ExportBranchesResponse>('/export/branches', { body: { ip } })
      if (res.success && res.branches) setBranches({ kind: 'ready', branches: res.branches })
      else setBranches({ kind: 'failed', message: res.message || 'โหลดรายชื่อสาขาไม่สำเร็จ' })
    } catch {
      setBranches({ kind: 'failed', message: 'โหลดรายชื่อสาขาไม่สำเร็จ' })
    }
  }

  // The branch list is read from the clinic right after a Check that says "ready" (an event, not an effect).
  const checkAndLoad = async () => {
    if (await server.check()) await loadBranches()
  }

  const rangeError = dueFrom && dueTo && dueFrom > dueTo ? 'วันหมดอายุเริ่มต้นต้องไม่หลังวันที่สิ้นสุด' : ''

  const run = async () => {
    if (busy) return
    if (rangeError) {
      setOutcome({ kind: 'error', message: rangeError })
      return
    }
    // "ทุกสาขา" sends no branch at all; a branch is sent as {code, name} exactly as the list gave it.
    const picked = branch ? (JSON.parse(branch) as [string, string]) : null
    setBusy(true)
    setOutcome(null)
    try {
      setOutcome(
        await runExport(
          () =>
            download(
              '/export/courses',
              {
                ip,
                ...(picked ? { branch: { code: picked[0], name: picked[1] } } : {}),
                due_from: dueFrom,
                due_to: dueTo,
              },
              `Courses_${ip}.xlsx`,
            ),
          (res) => {
            const notes: string[] = []
            if (res.extra['no-bill']) {
              notes.push(
                `มีคอร์สที่ยังใช้งานอยู่ ${res.extra['no-bill']} ใบ ที่ไม่มีบิลต้นทางในฐานข้อมูล จึงไม่ทราบสาขาและไม่อยู่ในไฟล์`,
              )
            }
            if (res.unreadable > 0) {
              notes.push(`${res.unreadable} แถวมีราคาคอร์สที่อ่านเป็นตัวเลขไม่ได้ในฐานข้อมูลสาขา (เว้นว่างไว้ในไฟล์)`)
            }
            if (res.extra['no-treatment']) {
              notes.push(`${res.extra['no-treatment']} แถวหารายการรักษา (listheals) ไม่พบ (รหัสและชื่อรายการเว้นว่างไว้)`)
            }
            return {
              summary: `${res.rows.toLocaleString('en-US')} แถว จาก ${(res.extra.courses ?? 0).toLocaleString('en-US')} คอร์ส`,
              notes,
            }
          },
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4">
      <BackLink onBack={onBack} />
      <PageHeader
        icon={Ticket}
        title="Export คอร์สคงเหลือ"
        description="ดาวน์โหลดคอร์สที่ลูกค้ายังใช้งานอยู่ของสาขา (หนึ่งแถวต่อหนึ่งรายการรักษาในคอร์ส) เป็นไฟล์ Excel (.xlsx)"
      />
      <div className="mb-4">
        <IpPicker ip={ip} setIp={changeIp} />
      </div>
      <ServerStatus state={server.state} checking={server.checking} message={server.message} />

      {server.state === 1 ? (
        <>
          <div className="mb-4">
            <label htmlFor="export-branch" className="block text-gray-300 text-sm font-medium mb-2">
              สาขา
            </label>
            {branches.kind === 'failed' ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-red-400">
                  <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {branches.message}
                </span>
                <button
                  onClick={() => void loadBranches()}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  ลองใหม่
                </button>
                <span className="text-xs text-gray-500">หรือดาวน์โหลดแบบทุกสาขาได้เลย</span>
              </div>
            ) : (
              <select
                id="export-branch"
                value={branch}
                disabled={branches.kind !== 'ready'}
                onChange={(e) => {
                  setBranch(e.target.value)
                  setOutcome(null)
                }}
                className={`${FIELD} disabled:opacity-60`}
              >
                <option value="">{branches.kind === 'ready' ? 'ทุกสาขา' : 'กำลังโหลดรายชื่อสาขา...'}</option>
                {branches.kind === 'ready' &&
                  branches.branches.map((b) => (
                    <option key={branchValue(b)} value={branchValue(b)}>
                      {branchLabel(b)}
                    </option>
                  ))}
              </select>
            )}
          </div>

          <details className="group mb-4 max-w-xl">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm text-gray-400 hover:text-gray-200 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
              กำหนดช่วงวันหมดอายุของคอร์ส (ไม่บังคับ)
            </summary>
            <div className="mt-3 flex flex-wrap gap-4">
              <DateField
                id="export-due-from"
                label="หมดอายุตั้งแต่วันที่"
                value={dueFrom}
                max={dueTo}
                onChange={(v) => {
                  setDueFrom(v)
                  setOutcome(null)
                }}
              />
              <DateField
                id="export-due-to"
                label="ถึงวันที่"
                value={dueTo}
                min={dueFrom}
                onChange={(v) => {
                  setDueTo(v)
                  setOutcome(null)
                }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">เว้นว่าง = ไม่จำกัด (ทุกคอร์สที่ยังใช้งานอยู่) รวมทั้งวันแรกและวันสุดท้าย</p>
          </details>

          <p className="mb-4 text-xs text-gray-500">รองรับสูงสุด 30,000 แถวต่อไฟล์ · ไฟล์มีชื่อและ HN ของผู้ป่วย โปรดเก็บรักษาข้อมูลอย่างระมัดระวัง</p>
          <DownloadButton onClick={run} busy={busy} />
        </>
      ) : (
        <CheckButton onClick={() => void checkAndLoad()} checking={server.checking} />
      )}

      <OutcomeView outcome={outcome} />
    </div>
  )
}

type ExportKey = 'df' | 'courses'

const EXPORTS: { key: ExportKey; title: string; description: ReactNode; icon: LucideIcon }[] = [
  {
    key: 'df',
    title: 'Export DF',
    description: 'รายการ DF ของแพทย์ ตามช่วงวันที่ พร้อมรายการและสาขา',
    icon: Stethoscope,
  },
  {
    key: 'courses',
    title: 'Export คอร์สคงเหลือ',
    description: 'คอร์สที่ลูกค้ายังใช้งานอยู่ แยกตามสาขา พร้อมจำนวนครั้งที่เหลือและวันหมดอายุ',
    icon: Ticket,
  },
]

/** Export data — the list of reports that can be downloaded as Excel; picking one opens its form. */
export function ExportData() {
  const [selected, setSelected] = useState<ExportKey | null>(null)

  if (selected === 'df') return <ExportDf onBack={() => setSelected(null)} />
  if (selected === 'courses') return <ExportCourses onBack={() => setSelected(null)} />

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
