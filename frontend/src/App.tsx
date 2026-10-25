import { LogIn, Lock, Settings, TriangleAlert, User, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { api, session, setUnauthorizedHandler } from './api.ts'
import { Dashboard } from './components/Dashboard.tsx'
import { IconInput } from './components/IconInput.tsx'
import type { BasicResponse, LoginResponse } from './types.ts'

const INVALID = 'Invalid credentials. Please check your username and password.'
const ERROR_VISIBLE_MS = 1500

/**
 * Login screen cross-fading into the dashboard, as in the original.
 * The password is now checked by the backend (POST /api/auth/login) instead of in the browser.
 */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showError, setShowError] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Remounts the dashboard on logout so no customer data stays in the hidden layer.
  const [sessionKey, setSessionKey] = useState(0)
  const hideTimer = useRef<number | undefined>(undefined)

  const logout = () => {
    session.clear()
    setLoggedIn(false)
    setUsername('')
    setPassword('')
    setShowError(false)
    setSessionKey((k) => k + 1)
  }

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (session.token()) {
      api<BasicResponse>('/auth/me')
        .then((res) => {
          if (res.success) setLoggedIn(true)
        })
        .catch(() => undefined)
    }
    return () => setUnauthorizedHandler(null)
  }, [])

  const fail = (message: string) => {
    setError(message)
    setShowError(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShowError(false), ERROR_VISIBLE_MS)
  }

  const login = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await api<LoginResponse>('/auth/login', { body: { username, password } })
      if (res.success && res.accessToken) {
        session.save(res.accessToken)
        setPassword('')
        setShowError(false)
        setLoggedIn(true)
      } else if (res.statusCode === 429) {
        fail('Too many login attempts. Please wait a minute and try again.')
      } else {
        fail(res.statusCode === 401 || !res.message ? INVALID : res.message)
      }
    } catch {
      fail('Cannot connect to the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen relative bg-gray-900">
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          loggedIn ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        inert={loggedIn}
      >
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <form
            onSubmit={login}
            className="bg-gray-800 p-10 rounded-xl shadow-2xl w-full max-w-md border border-gray-700"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400 ring-1 ring-inset ring-blue-400/25">
              <Settings className="h-9 w-9" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-8 text-white">CS Management System</h2>
            {showError && (
              <div
                role="alert"
                className="bg-red-800 border border-red-600 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-3"
              >
                <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="flex-1">{error}</span>
                <button
                  type="button"
                  onClick={() => setShowError(false)}
                  className="rounded p-1 text-red-200 hover:bg-red-700 hover:text-red-100 transition duration-200"
                  aria-label="ปิด"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="mb-6">
              <label className="block text-gray-300 text-sm font-medium mb-2">Username</label>
              <IconInput
                icon={<User className="h-5 w-5" />}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
              />
            </div>
            <div className="mb-8">
              <label className="block text-gray-300 text-sm font-medium mb-2">Password</label>
              <IconInput
                icon={<Lock className="h-5 w-5" />}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 transform hover:scale-105 disabled:opacity-50"
            >
              <LogIn className="h-5 w-5" aria-hidden="true" />
              Login
            </button>
          </form>
        </div>
      </div>

      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          loggedIn ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        inert={!loggedIn}
      >
        <Dashboard key={sessionKey} onLogout={logout} />
      </div>
    </div>
  )
}
