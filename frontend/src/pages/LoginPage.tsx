import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

export function LoginPage() {
  const { login, loading, error } = useAuth()
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
      <section className="login__brand">
        <div className="login__brand-inner">
          <span className="login__mark">DMS</span>
          <h1 className="login__headline">
            Every delivery, tracked from batch to doorstep.
          </h1>
          <p className="login__pitch">
            No more chasing updates through a WhatsApp thread. One place to
            assign, follow, and close out every delivery your drivers make today.
          </p>
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
          <h2 className="login__title">Sign in</h2>
          <p className="login__subtitle">Use your store account to continue.</p>

          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}

          <div className="login__field">
            <label htmlFor="email">Email</label>
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
              <label htmlFor="password">Password</label>
              <button
                type="button"
                className="login__reveal"
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
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
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            className="login__forgot"
            onClick={() => setShowResetHelp((s) => !s)}
            aria-expanded={showResetHelp}
          >
            Forgot your password?
          </button>
          {showResetHelp && (
            <p className="login__reset-help">
              Self-service reset isn&rsquo;t available yet. Ask an administrator
              to set a new password for your account.
            </p>
          )}
        </form>
      </main>
    </div>
  )
}
