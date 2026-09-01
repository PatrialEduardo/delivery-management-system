import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type Shipping } from '../../lib/api'
import './driver.css'

export function DriverShippingPage() {
  const { shippingId } = useParams()
  const navigate = useNavigate()
  const id = Number(shippingId)

  const [current, setCurrent] = useState<Shipping | null>(null)
  const [siblings, setSiblings] = useState<Shipping[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .myShipping(id)
      .then(async (s) => {
        if (!alive) return
        setCurrent(s)
        setError(null)
        try {
          const day = await api.myShippings(s.deliveryDate)
          if (alive) setSiblings(day.shippings.filter((x) => x.id !== s.id))
        } catch {
          /* switcher is a nicety */
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof ApiError ? e.message : 'Could not load the shipping.')
      })
    return () => {
      alive = false
    }
  }, [id])

  const loaded = current && current.id === id

  return (
    <div className="drv">
      <header className="drv__bar">
        <button type="button" className="drv__back" onClick={() => navigate('/d')}>
          ‹ Shippings
        </button>
        <span className="drv__title">{current?.batchCode ?? '…'}</span>
        <span className="drv__bar-spacer" />
      </header>

      <main className="drv__main">
        {error && <p className="drv__error">{error}</p>}
        {!loaded && !error && <p className="drv__note">Loading…</p>}

        {loaded && (
          <>
            <p className="drv-sh__meta">
              {current.driverName} · {current.deliveryDate}
            </p>
            {current.notes && <p className="drv-sh__notes">{current.notes}</p>}

            {siblings.length > 0 && (
              <div className="drv-sh__switch">
                {siblings.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="drv-chip"
                    onClick={() => navigate(`/d/shipping/${s.id}`)}
                  >
                    {s.batchCode}
                  </button>
                ))}
              </div>
            )}

            <ol className="drv-stops">
              {current.deliveries.map((d) => {
                const state = d.finishedAt ? 'done' : d.startedAt ? 'active' : 'todo'
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`drv-stop-row drv-stop-row--${state}`}
                      onClick={() => navigate(`/d/shipping/${id}/stop/${d.id}`)}
                    >
                      <span className="drv-stop-row__num">{d.order}</span>
                      <span className="drv-stop-row__body">
                        <span className="drv-stop-row__name">{d.customerName}</span>
                        <span className="drv-stop-row__addr">{d.addressLine}</span>
                      </span>
                      <span
                        className="status-badge"
                        style={{ ['--c' as string]: d.statusColor }}
                      >
                        {d.statusName}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </main>
    </div>
  )
}
