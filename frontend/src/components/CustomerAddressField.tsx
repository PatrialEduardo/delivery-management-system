import { useState } from 'react'
import { api, ApiError, type AddressInput, type Customer } from '../lib/api'

export interface CustomerAddressValue {
  customerId: string
  addressId: string
}

interface Props {
  customers: Customer[]
  value: CustomerAddressValue
  onChange: (v: CustomerAddressValue) => void
  onCustomersChanged: () => Promise<void> | void
}

const emptyAddress: AddressInput = {
  street: '',
  number: '',
  district: '',
  city: '',
  state: '',
  zipCode: '',
}

type Mode = 'pick' | 'newCustomer' | 'newAddress'

export function CustomerAddressField({ customers, value, onChange, onCustomersChanged }: Props) {
  const [mode, setMode] = useState<Mode>('pick')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [addr, setAddr] = useState<AddressInput>(emptyAddress)

  const selected = customers.find((c) => c.id === value.customerId)

  function resetDrafts() {
    setCustName('')
    setCustPhone('')
    setAddr(emptyAddress)
    setErr(null)
  }

  async function saveNewCustomer() {
    if (!custName.trim() || !addr.street.trim() || !addr.city.trim() || !addr.state.trim()) {
      setErr('Name, street, city and state are required.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const created = await api.createCustomer({
        fullName: custName.trim(),
        phone: custPhone.trim() || null,
        address: addr,
      })
      await onCustomersChanged()
      onChange({ customerId: created.id, addressId: created.addresses[0]?.id ?? '' })
      resetDrafts()
      setMode('pick')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the customer.')
    } finally {
      setBusy(false)
    }
  }

  async function saveNewAddress() {
    if (!value.customerId) return
    if (!addr.street.trim() || !addr.city.trim() || !addr.state.trim()) {
      setErr('Street, city and state are required.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const created = await api.addAddress(value.customerId, addr)
      await onCustomersChanged()
      onChange({ customerId: value.customerId, addressId: created.id })
      resetDrafts()
      setMode('pick')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the address.')
    } finally {
      setBusy(false)
    }
  }

  const addressFields = (
    <>
      <div className="field">
        <label>Street</label>
        <input
          value={addr.street}
          onChange={(e) => setAddr({ ...addr, street: e.target.value })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Number</label>
          <input
            value={addr.number ?? ''}
            onChange={(e) => setAddr({ ...addr, number: e.target.value })}
          />
        </div>
        <div className="field">
          <label>District</label>
          <input
            value={addr.district ?? ''}
            onChange={(e) => setAddr({ ...addr, district: e.target.value })}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>City</label>
          <input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
        </div>
        <div className="field">
          <label>State</label>
          <input
            maxLength={2}
            value={addr.state}
            onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })}
          />
        </div>
      </div>
      <div className="field">
        <label>ZIP</label>
        <input
          value={addr.zipCode ?? ''}
          onChange={(e) => setAddr({ ...addr, zipCode: e.target.value })}
        />
      </div>
    </>
  )

  if (mode === 'newCustomer') {
    return (
      <div className="ca-sub">
        {err && <p className="form-error">{err}</p>}
        <div className="field">
          <label>Customer name</label>
          <input value={custName} onChange={(e) => setCustName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
        </div>
        {addressFields}
        <div className="ca-sub__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              resetDrafts()
              setMode('pick')
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={saveNewCustomer} disabled={busy}>
            {busy ? 'Saving…' : 'Save customer'}
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'newAddress') {
    return (
      <div className="ca-sub">
        {err && <p className="form-error">{err}</p>}
        <p className="ca-sub__for">New address for {selected?.fullName}</p>
        {addressFields}
        <div className="ca-sub__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              resetDrafts()
              setMode('pick')
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={saveNewAddress} disabled={busy}>
            {busy ? 'Saving…' : 'Save address'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="field">
        <label htmlFor="ca-customer">Customer</label>
        <select
          id="ca-customer"
          value={value.customerId}
          onChange={(e) => onChange({ customerId: e.target.value, addressId: '' })}
        >
          <option value="">Select a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </select>
        <button type="button" className="btn--link" onClick={() => setMode('newCustomer')}>
          + New customer
        </button>
      </div>

      {value.customerId && (
        <div className="field">
          <label htmlFor="ca-address">Address</label>
          <select
            id="ca-address"
            value={value.addressId}
            onChange={(e) => onChange({ ...value, addressId: e.target.value })}
          >
            <option value="">Select an address…</option>
            {selected?.addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.line}
              </option>
            ))}
          </select>
          <button type="button" className="btn--link" onClick={() => setMode('newAddress')}>
            + New address
          </button>
        </div>
      )}
    </>
  )
}
