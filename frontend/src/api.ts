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
