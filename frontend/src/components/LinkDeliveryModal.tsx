import { useEffect, useState } from 'react'
import { api, ApiError, type LinkableDelivery, type Shipping } from '../lib/api'
import { Modal } from './Modal'

interface Props {
  shipping: Shipping
  date: string
  onClose: () => void
  onLinked: () => Promise<void>
}

export function LinkDeliveryModal({ shipping, date, onClose, onLinked }: Props) {
  const [rows, setRows] = useState<LinkableDelivery[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .linkableDeliveries(date, shipping.id)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setErr('Could not load deliveries.'))
    return () => {
      alive = false
    }
  }, [date, shipping.id])

  async function link() {
    if (selected == null) return
    setBusy(true)
    setErr(null)
    try {
      await api.linkDelivery(shipping.id, selected)
      await onLinked()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not link the delivery.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Link a delivery into ${shipping.batchCode}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={link}
            disabled={busy || selected == null}
          >
            {busy ? 'Linking…' : 'Link delivery'}
          </button>
        </>
      }
    >
      {err && <p className="form-error">{err}</p>}

      <p className="link-hint">Only deliveries scheduled for the same day are shown.</p>

      {rows == null && !err && <p className="link-empty">Loading…</p>}
      {rows != null && rows.length === 0 && (
        <p className="link-empty">No other deliveries on {date}.</p>
      )}

      <ul className="link-list">
        {rows?.map((d) => (
          <li key={d.id}>
            <label className="link-item">
              <input
                type="radio"
                name="link-delivery"
                checked={selected === d.id}
                onChange={() => setSelected(d.id)}
              />
              <span className="link-item__main">
                <span className="link-item__name">{d.customerName}</span>
                <span className="link-item__addr">{d.addressLine}</span>
                <span className="link-item__from">now in {d.batchCode}</span>
              </span>
              <span className="status-badge" style={{ ['--c' as string]: d.statusColor }}>
                {d.statusName}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
