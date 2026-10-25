import { useState } from 'react'
import { api } from '../api.ts'
import { isIPv4 } from '../format.ts'
import type { ConnectResponse } from '../types.ts'

/** 0 = not checked, 1 = พร้อม, 2 = ไม่พร้อม (same codes as the original). */
export type ServerState = 0 | 1 | 2

const CHECK_TIMEOUT_MS = 10_000

/** The "Check" button: POST /connect for the IP typed or picked on the page. */
export function useServerCheck(ip: string) {
  const [state, setState] = useState<ServerState>(0)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')

  const check = async () => {
    if (checking) return
    if (!ip.trim() || !isIPv4(ip)) {
      setState(0)
      return
    }
    setChecking(true)
    setMessage('')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
    try {
      const res = await api<ConnectResponse>('/connect', {
        body: { ip },
        signal: controller.signal,
      })
      setState(res.status === 'ready' ? 1 : 2)
      setMessage(res.status === 'ready' ? '' : (res.message ?? ''))
    } catch {
      setState(2)
    } finally {
      setChecking(false)
      clearTimeout(timer)
    }
  }

  /** Changing the IP invalidates a previous check, so data is never read from one branch and written to another. */
  const reset = () => {
    setState(0)
    setMessage('')
  }

  return { state, checking, message, check, reset }
}
