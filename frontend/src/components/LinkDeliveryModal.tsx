import { useEffect, useState } from 'react'
import { api, ApiError, type LinkableDelivery, type Shipping } from '../lib/api'
import { useT } from '../context/LanguageContext'
import { statusLabel } from '../lib/status'
import { isoToBR } from '../lib/date'
import { Modal } from './Modal'

interface Props {
  shipping: Shipping
  date: string
  onClose: () => void
  onLinked: () => Promise<void>
}

export function LinkDeliveryModal({ shipping, date, onClose, onLinked }: Props) {
  const t = useT()
  const [rows, setRows] = useState<LinkableDelivery[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .linkableDeliveries(date, shipping.id)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setErr(t.linkDelivery.errLoad))
    return () => {
      alive = false
    }
  }, [date, shipping.id, t])

  async function link() {
    if (selected == null) return
    setBusy(true)
    setErr(null)
    try {
      await api.linkDelivery(shipping.id, selected)
      await onLinked()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.linkDelivery.errLink)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t.linkDelivery.title(shipping.batchCode)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={link}
            disabled={busy || selected == null}
          >
            {busy ? t.common.linking : t.linkDelivery.link}
          </button>
        </>
      }
    >
      {err && <p className="form-error">{err}</p>}

      <p className="link-hint">{t.linkDelivery.hint}</p>

      {rows == null && !err && <p className="link-empty">{t.common.loading}</p>}
      {rows != null && rows.length === 0 && (
        <p className="link-empty">{t.linkDelivery.noneOn(isoToBR(date))}</p>
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
                <span className="link-item__from">{t.linkDelivery.nowIn(d.batchCode)}</span>
              </span>
              <span className="status-badge" style={{ ['--c' as string]: d.statusColor }}>
                {statusLabel(t, d.statusCode, d.statusName)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
