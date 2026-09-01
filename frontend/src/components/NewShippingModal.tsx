import { useState } from 'react'
import { ApiError, type Driver } from '../lib/api'
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
  const [driverUserId, setDriverUserId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!driverUserId) {
      setErr('Pick a driver.')
      return
    }
    if (!date) {
      setErr('Pick a date.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await onCreate({ driverUserId, deliveryDate: date, notes: notes.trim() || null })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create the shipping.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="New shipping"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create shipping'}
          </button>
        </>
      }
    >
      {err && <p className="form-error">{err}</p>}

      <div className="field">
        <label htmlFor="ns-driver">Driver</label>
        <select
          id="ns-driver"
          value={driverUserId}
          onChange={(e) => setDriverUserId(e.target.value)}
        >
          <option value="">Select a driver…</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="ns-date">Date</label>
        <input
          id="ns-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="ns-notes">Notes</label>
        <textarea
          id="ns-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional — e.g. Morning route, south zone"
        />
      </div>
    </Modal>
  )
}
