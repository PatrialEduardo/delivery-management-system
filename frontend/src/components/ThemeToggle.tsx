import { useTheme } from '../context/ThemeContext'
import './theme-toggle.css'

/**
 * A single button that flips light <-> dark. `className` lets a screen add
 * positioning (e.g. the floating variant on the login page).
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? (
        // sun
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="12" y1="2.5" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="21.5" />
            <line x1="2.5" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="21.5" y2="12" />
            <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
            <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
            <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
            <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
          </g>
        </svg>
      ) : (
        // moon
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  )
}
