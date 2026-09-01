import { useState } from 'react'
import { ApiError, type Customer, type Shipping } from '../lib/api'
import { Modal } from './Modal'
import { CustomerAddressField, type CustomerAddressValue } from './CustomerAddressField'

interface Props {
  shippings: Shipping[]
  fixedShippingId?: number
  customers: Customer[]
  onCustomersChanged: () => Promise<void> | void
  onClose: () => void
  onAdd: (
    shippingId: number,
    body: { customerId: string; addressId: string; notes?: string | null },
  ) => Promise<void>
}

export function AddDeliveryModal({
  shippings,
  fixedShippingId,
  customers,
  onCustomersChanged,
  onClose,
  onAdd,
}: Props) {
  const [shippingId, setShippingId] = useState<number | ''>(fixedShippingId ?? '')
  const [ca, setCa] = useState<CustomerAddressValue>({ customerId: '', addressId: '' })
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fixed = shippings.find((s) => s.id === fixedShippingId)
  const canSubmit = shippingId !== '' && ca.customerId !== '' && ca.addressId !== ''

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      await onAdd(Number(shippingId), {
        customerId: ca.customerId,
        addressId: ca.addressId,
        notes: notes.trim() || null,
      })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not add the delivery.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="New delivery"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={submit}
            disabled={busy || !canSubmit}
          >
            {busy ? 'Adding…' : 'Add delivery'}
          </button>
        </>
      }
    >
      {err && <p className="form-error">{err}</p>}

      {fixed ? (
        <p className="add-delivery__target">
          Adding to <strong>{fixed.batchCode}</strong> · {fixed.driverName}
        </p>
      ) : shippings.length === 0 ? (
        <p className="form-error">Create a shipping for this day first.</p>
      ) : (
        <div className="field">
          <label htmlFor="ad-shipping">Shipping</label>
          <select
            id="ad-shipping"
            value={shippingId}
            onChange={(e) => setShippingId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select a shipping…</option>
            {shippings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.batchCode} · {s.driverName}
              </option>
            ))}
          </select>
        </div>
      )}

      <CustomerAddressField
        customers={customers}
        value={ca}
        onChange={setCa}
        onCustomersChanged={onCustomersChanged}
      />

      <div className="field">
        <label htmlFor="ad-notes">Notes</label>
        <textarea
          id="ad-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>
    </Modal>
  )
}
