import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

export function LoginPage() {
  const { login, loading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await login(email, password)
    } catch {
      // error is already surfaced via useAuth().error
    }
  }

  return (
    <div className="login-screen">
      <aside className="login-context">
        <div className="login-context__mark">DMS</div>
        <h1 className="login-context__headline">
          Every delivery,
          <br />
          tracked from batch to doorstep.
        </h1>
        <p className="login-context__body">
          No more chasing updates through a WhatsApp thread. One place to assign,
          follow, and close out every delivery your drivers make today.
        </p>
        <svg className="login-context__route" viewBox="0 0 240 120" fill="none">
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
      </aside>

      <main className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="login-form__subtitle">Use your store account to continue.</p>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="login-form__error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}
