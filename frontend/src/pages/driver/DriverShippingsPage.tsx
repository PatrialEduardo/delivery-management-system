import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useT } from '../../context/LanguageContext'
import { api, ApiError, type Shipping } from '../../lib/api'
import { isoToBR } from '../../lib/date'
import { ThemeToggle } from '../../components/ThemeToggle'
import './driver.css'

export function DriverShippingsPage() {
  const { logout } = useAuth()
  const t = useT()
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
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
      setError(e instanceof ApiError ? e.message : tRef.current.common.serverError)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('')
  }, [load])

  return (
    <div className="drv">
      <header className="drv__bar">
        <span className="drv__title">{t.driver.myDeliveries}</span>
        <input
          className="drv__date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            load(e.target.value)
          }}
          aria-label={t.driver.dateAria}
        />
        <ThemeToggle />
        <button type="button" className="drv__logout" onClick={logout}>
          {t.common.logOut}
        </button>
      </header>

      <main className="drv__main">
        {error && <p className="drv__error">{error}</p>}
        {!shippings && !error && <p className="drv__note">{t.common.loading}</p>}
        {shippings?.length === 0 && (
          <p className="drv__note">{t.driver.nothingScheduled(isoToBR(date))}</p>
        )}

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
              <span className="drv-card__meta">{t.driver.stopsDone(done, total)}</span>
              {s.notes && <span className="drv-card__notes">{s.notes}</span>}
            </button>
          )
        })}
      </main>
    </div>
  )
}
