import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type Shipping } from '../../lib/api'
import { directionsUrl, getPositionBestEffort, telUrl, whatsappUrl } from '../../lib/geo'
import './driver.css'

type Outcome = 'COMPLETE' | 'ABSENT' | 'TROUBLE'

export function DriverStopPage() {
  const { shippingId, deliveryId } = useParams()
  const navigate = useNavigate()
  const sid = Number(shippingId)
  const did = Number(deliveryId)

  const [shipping, setShipping] = useState<Shipping | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [opErr, setOpErr] = useState<string | null>(null)
  const [troubleOpen, setTroubleOpen] = useState(false)
  const [troubleNote, setTroubleNote] = useState('')

  const load = useCallback(async () => {
    try {
      setShipping(await api.myShipping(sid))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the delivery.')
    }
  }, [sid])

  useEffect(() => {
    // Fetch-on-mount / on-id-change; the async setState inside load() is
    // what this rule flags, which is the intended pattern here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const stops = shipping?.deliveries ?? []
  const idx = stops.findIndex((d) => d.id === did)
  const stop = idx >= 0 ? stops[idx] : null
  const prev = idx > 0 ? stops[idx - 1] : null
  const next = idx >= 0 && idx < stops.length - 1 ? stops[idx + 1] : null

  async function start() {
    setBusy(true)
    setOpErr(null)
    try {
      const geo = await getPositionBestEffort()
      await api.startDelivery(did, geo)
      await load()
    } catch (e) {
      setOpErr(e instanceof ApiError ? e.message : 'Could not start the delivery.')
    } finally {
      setBusy(false)
    }
  }

  async function finish(outcome: Outcome, note?: string) {
    setBusy(true)
    setOpErr(null)
    try {
      const geo = await getPositionBestEffort()
      await api.finishDelivery(did, { outcome, note, lat: geo?.lat, lng: geo?.lng })
      setTroubleOpen(false)
      setTroubleNote('')
      await load()
    } catch (e) {
      setOpErr(e instanceof ApiError ? e.message : 'Could not finish the delivery.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="drv">
      <header className="drv__bar">
        <button
          type="button"
          className="drv__back"
          onClick={() => navigate(`/d/shipping/${sid}`)}
        >
          ‹ {shipping?.batchCode ?? 'Shipping'}
        </button>
        <span className="drv__title">
          {idx >= 0 ? `Stop ${idx + 1} of ${stops.length}` : ''}
        </span>
        <span className="drv__bar-spacer" />
      </header>

      <main className="drv__main drv__main--stop">
        {error && <p className="drv__error">{error}</p>}
        {!shipping && !error && <p className="drv__note">Loading…</p>}
        {shipping && !stop && <p className="drv__note">That stop isn&rsquo;t on this shipping.</p>}

        {stop && (
          <>
            <div className="drv-stop__card">
              <span className="status-badge" style={{ ['--c' as string]: stop.statusColor }}>
                {stop.statusName}
              </span>
              <h1 className="drv-stop__name">{stop.customerName}</h1>
              <p className="drv-stop__addr">{stop.addressLine}</p>
              {stop.attemptNumber > 1 && (
                <p className="drv-stop__attempt">Attempt {stop.attemptNumber}</p>
              )}

              <div className="drv-stop__links">
                <a
                  className="drv-btn drv-btn--route"
                  href={directionsUrl(stop)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Route
                </a>
                {stop.customerPhone && (
                  <>
                    <a className="drv-btn drv-btn--wa" href={whatsappUrl(stop.customerPhone)}>
                      WhatsApp
                    </a>
                    <a className="drv-btn drv-btn--call" href={telUrl(stop.customerPhone)}>
                      Call
                    </a>
                  </>
                )}
              </div>
            </div>

            {stop.finishedAt ? (
              <div className="drv-stop__result">
                <p className="drv-stop__result-line">
                  Closed as <strong>{stop.statusName}</strong> ·{' '}
                  {new Date(stop.finishedAt).toLocaleString()}
                </p>
                {stop.notes && <p className="drv-stop__result-note">{stop.notes}</p>}
              </div>
            ) : (
              <div className="drv-stop__ops">
                {opErr && <p className="drv__error">{opErr}</p>}

                {!stop.startedAt ? (
                  <button
                    type="button"
                    className="drv-btn drv-btn--primary drv-btn--big"
                    onClick={start}
                    disabled={busy}
                  >
                    {busy ? 'Starting…' : 'Start delivery'}
                  </button>
                ) : troubleOpen ? (
                  <div className="drv-trouble">
                    <label htmlFor="trouble">Describe the problem</label>
                    <textarea
                      id="trouble"
                      value={troubleNote}
                      onChange={(e) => setTroubleNote(e.target.value)}
                      placeholder="At least 15 characters"
                      rows={3}
                      autoFocus
                    />
                    <span className="drv-trouble__count">{troubleNote.trim().length}/15</span>
                    <div className="drv-trouble__actions">
                      <button
                        type="button"
                        className="drv-btn"
                        onClick={() => {
                          setTroubleOpen(false)
                          setTroubleNote('')
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="drv-btn drv-btn--danger"
                        disabled={busy || troubleNote.trim().length < 15}
                        onClick={() => finish('TROUBLE', troubleNote.trim())}
                      >
                        {busy ? 'Saving…' : 'Report trouble'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="drv-stop__outcomes">
                    <button
                      type="button"
                      className="drv-btn drv-btn--ok drv-btn--big"
                      onClick={() => finish('COMPLETE')}
                      disabled={busy}
                    >
                      Delivery complete
                    </button>
                    <button
                      type="button"
                      className="drv-btn drv-btn--warn"
                      onClick={() => finish('ABSENT')}
                      disabled={busy}
                    >
                      Absent client
                    </button>
                    <button
                      type="button"
                      className="drv-btn drv-btn--danger"
                      onClick={() => setTroubleOpen(true)}
                      disabled={busy}
                    >
                      Trouble
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {stop && (
        <nav className="drv-stop__nav">
          <button
            type="button"
            className="drv-btn"
            disabled={!prev}
            onClick={() => prev && navigate(`/d/shipping/${sid}/stop/${prev.id}`)}
          >
            ‹ Prev
          </button>
          <button
            type="button"
            className="drv-btn"
            disabled={!next}
            onClick={() => next && navigate(`/d/shipping/${sid}/stop/${next.id}`)}
          >
            Next ›
          </button>
        </nav>
      )}
    </div>
  )
}
