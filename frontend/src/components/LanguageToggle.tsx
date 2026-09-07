import { useLang, useT, type Lang } from '../context/LanguageContext'
import './language-toggle.css'

const ORDER: Lang[] = ['pt-BR', 'en-US']

/** Brazil — simplified (no star field / band; unreadable at this size anyway). */
function BrFlag() {
  return (
    <svg viewBox="0 0 28 20" width="22" height="16" aria-hidden="true" className="flag">
      <rect width="28" height="20" fill="#009c3b" />
      <path d="M14 2.4 26 10 14 17.6 2 10Z" fill="#ffdf00" />
      <circle cx="14" cy="10" r="4" fill="#002776" />
    </svg>
  )
}

/** USA — 13 stripes + canton, stars as a small dot cluster. */
function UsFlag() {
  const dots = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      dots.push(<circle key={`${r}-${c}`} cx={1.6 + c * 2.2} cy={1.4 + r * 2.4} r="0.55" fill="#fff" />)
    }
  }
  return (
    <svg viewBox="0 0 28 20" width="22" height="16" aria-hidden="true" className="flag">
      <rect width="28" height="20" fill="#b22234" />
      <g fill="#fff">
        <rect y="1.54" width="28" height="1.54" />
        <rect y="4.62" width="28" height="1.54" />
        <rect y="7.69" width="28" height="1.54" />
        <rect y="10.77" width="28" height="1.54" />
        <rect y="13.85" width="28" height="1.54" />
        <rect y="16.92" width="28" height="1.54" />
      </g>
      <rect width="12.2" height="10.77" fill="#3c3b6e" />
      {dots}
    </svg>
  )
}

function Flag({ lang }: { lang: Lang }) {
  return lang === 'pt-BR' ? <BrFlag /> : <UsFlag />
}

/**
 * Two-flag language switcher. `className` lets a host add positioning
 * (e.g. `lang-toggle--floating` on the login page).
 */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang()
  const t = useT()

  return (
    <div className={`lang-toggle ${className}`.trim()} role="group" aria-label={t.lang.label}>
      {ORDER.map((l) => {
        const name = l === 'pt-BR' ? t.lang.portuguese : t.lang.english
        return (
          <button
            key={l}
            type="button"
            className={`lang-toggle__btn${lang === l ? ' lang-toggle__btn--on' : ''}`}
            aria-pressed={lang === l}
            title={name}
            onClick={() => setLang(l)}
          >
            <Flag lang={l} />
            <span className="sr-only">{name}</span>
          </button>
        )
      })}
    </div>
  )
}
