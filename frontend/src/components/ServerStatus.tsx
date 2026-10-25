import { CircleCheck, CircleDashed, CircleX, LoaderCircle, Server } from 'lucide-react'
import type { ServerState } from '../hooks/useServerCheck.ts'

interface Props {
  state: ServerState
  checking: boolean
  message?: string
}

/** Result of the "Check" button: a status pill (not checked / checking / ready / not ready) plus the reason. */
export function ServerStatus({ state, checking, message }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="inline-flex items-center gap-2 text-gray-300">
        <Server className="h-4 w-4 text-gray-500" aria-hidden="true" />
        Server Status:
      </span>
      {checking ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-700/60 px-3 py-1 text-sm text-gray-300">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          กำลังตรวจสอบ
        </span>
      ) : state === 1 ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-400 ring-1 ring-inset ring-green-500/30">
          <CircleCheck className="h-4 w-4" aria-hidden="true" />
          พร้อม
        </span>
      ) : state === 2 ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-sm font-medium text-red-400 ring-1 ring-inset ring-red-500/30">
          <CircleX className="h-4 w-4" aria-hidden="true" />
          ไม่พร้อม
        </span>
      ) : (
        <CircleDashed className="h-5 w-5 text-gray-500" aria-label="ยังไม่ได้ตรวจสอบ" />
      )}
      {!checking && state === 2 && message && (
        <span className="text-xs text-gray-500">{message}</span>
      )}
    </div>
  )
}
