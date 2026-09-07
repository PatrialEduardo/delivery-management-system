import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { api, ApiError, type LoginResponse } from '../lib/api'
import { useT } from './LanguageContext'

interface AuthUser {
  userId: string
  fullName: string
  email: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
  error: string | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const TOKEN_KEY = 'dms_access_token'
const USER_KEY = 'dms_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      setError(null)
      try {
        const res: LoginResponse = await api.login(email, password)
        localStorage.setItem(TOKEN_KEY, res.accessToken)
        localStorage.setItem(USER_KEY, JSON.stringify(res.user))
        setUser(res.user)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t.common.serverError)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem('dms_boot_redirect_done')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, login, logout, loading, error }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
