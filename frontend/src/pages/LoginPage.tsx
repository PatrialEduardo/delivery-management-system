import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LanguageContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { LanguageToggle } from '../components/LanguageToggle'
import './LoginPage.css'

export function LoginPage() {
  const { login, loading, error } = useAuth()
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showResetHelp, setShowResetHelp] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await login(email, password)
    } catch {
      // error is already surfaced via useAuth().error
    }
  }

  return (
    <div className="login">
      <LanguageToggle className="lang-toggle--floating" />
      <ThemeToggle className="theme-toggle--floating" />
      <section className="login__brand">
        <div className="login__brand-inner">
          <span className="login__mark">DMS</span>
          <h1 className="login__headline">{t.login.headline}</h1>
          <p className="login__pitch">{t.login.pitch}</p>
          <svg
            className="login__route"
            viewBox="0 0 240 120"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 100 C 60 100, 60 20, 110 20 S 180 100, 230 60"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray="1 10"
              strokeLinecap="round"
            />
            <circle cx="10" cy="100" r="4" fill="var(--accent)" />
            <circle cx="110" cy="20" r="4" fill="var(--accent)" />
            <circle cx="230" cy="60" r="4" fill="var(--accent)" />
          </svg>
        </div>
      </section>

      <main className="login__panel">
        <form className="login__form" onSubmit={handleSubmit} noValidate>
          <h2 className="login__title">{t.login.title}</h2>
          <p className="login__subtitle">{t.login.subtitle}</p>

          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}

          <div className="login__field">
            <label htmlFor="email">{t.login.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              required
            />
          </div>

          <div className="login__field">
            <div className="login__label-row">
              <label htmlFor="password">{t.login.password}</label>
              <button
                type="button"
                className="login__reveal"
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
              >
                {showPassword ? t.login.hide : t.login.show}
              </button>
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              required
            />
          </div>

          <button type="submit" className="login__submit" disabled={loading}>
            {loading ? t.login.signingIn : t.login.signIn}
          </button>

          <button
            type="button"
            className="login__forgot"
            onClick={() => setShowResetHelp((s) => !s)}
            aria-expanded={showResetHelp}
          >
            {t.login.forgot}
          </button>
          {showResetHelp && <p className="login__reset-help">{t.login.resetHelp}</p>}
        </form>
      </main>
    </div>
  )
}
