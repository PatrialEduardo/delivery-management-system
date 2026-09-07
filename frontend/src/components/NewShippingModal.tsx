import { useState } from 'react'
import { ApiError, type Driver } from '../lib/api'
import { useT } from '../context/LanguageContext'
import { Modal } from './Modal'

interface Props {
  drivers: Driver[]
  defaultDate: string
  onClose: () => void
  onCreate: (body: {
    driverUserId: string
    deliveryDate: string
    notes?: string | null
  }) => Promise<void>
}

export function NewShippingModal({ drivers, defaultDate, onClose, onCreate }: Props) {
  const t = useT()
  const [driverUserId, setDriverUserId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!driverUserId) {
      setErr(t.newShipping.pickDriver)
      return
    }
    if (!date) {
      setErr(t.newShipping.pickDate)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await onCreate({ driverUserId, deliveryDate: date, notes: notes.trim() || null })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.newShipping.errCreate)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t.newShipping.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>
            {busy ? t.common.creating : t.newShipping.create}
          </button>
        </>
      }
    >
      {err && <p className="form-error">{err}</p>}

      <div className="field">
        <label htmlFor="ns-driver">{t.newShipping.driver}</label>
        <select
          id="ns-driver"
          value={driverUserId}
          onChange={(e) => setDriverUserId(e.target.value)}
        >
          <option value="">{t.newShipping.selectDriver}</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="ns-date">{t.newShipping.date}</label>
        <input
          id="ns-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="ns-notes">{t.newShipping.notes}</label>
        <textarea
          id="ns-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.newShipping.notesPlaceholder}
        />
      </div>
    </Modal>
  )
}
