import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  /** true when the current theme follows the OS rather than an explicit choice. */
  isSystem: boolean
  toggle: () => void
  setTheme: (t: Theme) => void
  /** drop the explicit choice and follow the OS again. */
  useSystem: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORE_KEY = 'dms_theme'

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStored(): Theme | null {
  const raw = localStorage.getItem(STORE_KEY)
  return raw === 'light' || raw === 'dark' ? raw : null
}

/** Apply (or clear) the data-theme attribute the palette in index.css keys off. */
function applyAttr(choice: Theme | null) {
  const root = document.documentElement
  if (choice) root.setAttribute('data-theme', choice)
  else root.removeAttribute('data-theme')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Theme | null>(() => readStored())
  const [system, setSystem] = useState<Theme>(() => systemTheme())

  // Keep following the OS while the user hasn't overridden it.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    applyAttr(choice)
  }, [choice])

  const theme: Theme = choice ?? system

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORE_KEY, t)
    setChoice(t)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  const useSystem = useCallback(() => {
    localStorage.removeItem(STORE_KEY)
    setChoice(null)
  }, [])

  return (
    <ThemeContext.Provider
      value={{ theme, isSystem: choice === null, toggle, setTheme, useSystem }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
