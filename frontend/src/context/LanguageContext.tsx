import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { ptBR } from '../i18n/pt-BR'
import { enUS } from '../i18n/en-US'

export type Lang = 'pt-BR' | 'en-US'
export type Messages = typeof ptBR

const DICTS: Record<Lang, Messages> = { 'pt-BR': ptBR, 'en-US': enUS }
const STORE_KEY = 'dms_lang'

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  /** the active dictionary — `t.home.clear`, `t.home.noShippingsForRange(x)` */
  t: Messages
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

function readStored(): Lang {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw === 'pt-BR' || raw === 'en-US') return raw
  } catch {
    /* private mode / storage disabled — fall through */
  }
  return 'pt-BR' // Brazilian Portuguese is the default
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStored())

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORE_KEY, l)
    } catch {
      /* ignore — the choice still applies for this session */
    }
    setLangState(l)
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: DICTS[lang] }}>
      {children}
    </LanguageContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider')
  return ctx
}

/** Shorthand for the active dictionary. */
// eslint-disable-next-line react-refresh/only-export-components
export function useT(): Messages {
  return useLang().t
}
