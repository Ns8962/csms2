import type { BasicResponse } from './types.ts'

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'
const TOKEN_KEY = 'csms2_token'

/** JWT kept in sessionStorage: survives a page refresh, cleared when the browser closes. */
export const session = {
  token: () => sessionStorage.getItem(TOKEN_KEY),
  save: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

let unauthorizedHandler: (() => void) | null = null

/** Called when a request made with a token gets 401 (expired or disabled user). */
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler
}

const messageOf = (data: unknown): string | undefined => {
  const message = (data as { message?: unknown } | null)?.message
  if (Array.isArray(message)) return message.join(', ')
  return typeof message === 'string' ? message : undefined
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
}

/**
 * fetch wrapper. As in the original client, callers read `success` / `status`
 * from the JSON body: non-2xx responses come back as `{ success: false, message }`
 * instead of throwing. Network errors and aborts still throw.
 */
export async function api<T extends BasicResponse>(
  path: string,
  { method, body, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = session.token()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  const data: unknown = await res.json().catch(() => null)

  if (res.ok) return (data ?? {}) as T

  if (res.status === 401 && token) {
    session.clear()
    unauthorizedHandler?.()
  }
  return {
    ...(data !== null && typeof data === 'object' ? data : {}),
    success: false,
    statusCode: res.status,
    message: messageOf(data) ?? `HTTP ${res.status}`,
  } as T
}

export type DownloadResult =
  | {
      ok: true
      blob: Blob
      filename: string
      /** Numbers the server reports about the file (response headers). */
      rows: number
      total: number
      unreadable: number
      /** Every `X-Export-*` header by name without the prefix, lower case (for example `courses`, `no-bill`). */
      extra: Record<string, number>
    }
  | { ok: false; message: string; statusCode: number; code?: string }

/** `filename="DF_1.2.3.4_2026-10-01_2026-10-31.xlsx"` from Content-Disposition, or the fallback. */
const filenameOf = (header: string | null, fallback: string) =>
  /filename="([^"]+)"/.exec(header ?? '')?.[1] ?? fallback

/**
 * POST a request whose successful answer is a file. Failures come back as `{ ok: false, message }`
 * (the server sends `{ success: false, message }` JSON), like `api()`; network errors and aborts throw.
 */
export async function download(
  path: string,
  body: unknown,
  fallbackName: string,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  const headers: Record<string, string> = {
    Accept: '*/*',
    'Content-Type': 'application/json',
  }
  const token = session.token()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (res.ok) {
    const extra: Record<string, number> = {}
    res.headers.forEach((value, name) => {
      if (name.startsWith('x-export-')) extra[name.slice('x-export-'.length)] = Number(value)
    })
    return {
      ok: true,
      blob: await res.blob(),
      filename: filenameOf(res.headers.get('content-disposition'), fallbackName),
      rows: Number(res.headers.get('x-export-rows') ?? 0),
      total: Number(res.headers.get('x-export-total') ?? 0),
      unreadable: Number(res.headers.get('x-export-unreadable') ?? 0),
      extra,
    }
  }

  const data: unknown = await res.json().catch(() => null)
  if (res.status === 401 && token) {
    session.clear()
    unauthorizedHandler?.()
  }
  // The rate limiter answers 429 in English ("ThrottlerException: Too Many Requests"); say it in Thai.
  const serverMessage = messageOf(data)
  const message =
    res.status === 429 && /Too Many Requests/i.test(serverMessage ?? '')
      ? 'ส่งออกถี่เกินไป กรุณารอ 1 นาทีแล้วลองใหม่'
      : (serverMessage ?? `HTTP ${res.status}`)
  const code = (data as { code?: unknown } | null)?.code
  return {
    ok: false,
    message,
    statusCode: res.status,
    code: typeof code === 'string' ? code : undefined,
  }
}
