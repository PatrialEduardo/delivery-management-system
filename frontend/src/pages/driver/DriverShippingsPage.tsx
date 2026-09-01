import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api, ApiError, type Shipping } from '../../lib/api'
import './driver.css'

export function DriverShippingsPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [date, setDate] = useState('')
  const [shippings, setShippings] = useState<Shipping[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: string) => {
    setError(null)
    setShippings(null)
    try {
      const r = await api.myShippings(d)
      setShippings(r.shippings)
      setDate(r.date)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('')
  }, [load])

  return (
    <div className="drv">
      <header className="drv__bar">
        <span className="drv__title">My deliveries</span>
        <input
          className="drv__date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            load(e.target.value)
          }}
          aria-label="Date"
        />
        <button type="button" className="drv__logout" onClick={logout}>
          Log out
        </button>
      </header>

      <main className="drv__main">
        {error && <p className="drv__error">{error}</p>}
        {!shippings && !error && <p className="drv__note">Loading…</p>}
        {shippings?.length === 0 && <p className="drv__note">Nothing scheduled for {date}.</p>}

        {shippings?.map((s) => {
          const done = s.deliveries.filter((d) => d.finishedAt).length
          const total = s.deliveries.length
          return (
            <button
              key={s.id}
              type="button"
              className="drv-card"
              onClick={() => navigate(`/d/shipping/${s.id}`)}
            >
              <span className="drv-card__code">{s.batchCode}</span>
              <span className="drv-card__meta">
                {total} stop{total === 1 ? '' : 's'} · {done}/{total} done
              </span>
              {s.notes && <span className="drv-card__notes">{s.notes}</span>}
            </button>
          )
        })}
      </main>
    </div>
  )
}
