import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LanguageContext'
import {
  api,
  ApiError,
  type Address,
  type AddressInput,
  type Customer,
} from '../lib/api'
import { ThemeToggle } from '../components/ThemeToggle'
import { LanguageToggle } from '../components/LanguageToggle'
import { money } from '../lib/money'
import { isoToBR } from '../lib/date'
import '../components/ui.css'
import './CustomersPage.css'

interface NewCustomer {
  fullName: string
  phone: string
  notes: string
  street: string
  number: string
  district: string
  city: string
  state: string
  zipCode: string
}

const BLANK: NewCustomer = {
  fullName: '',
  phone: '',
  notes: '',
  street: '',
  number: '',
  district: '',
  city: '',
  state: '',
  zipCode: '',
}

export function CustomersPage() {
  const { user, logout } = useAuth()
  const t = useT()
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const navigate = useNavigate()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<NewCustomer>(BLANK)
  const [creating, setCreating] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const load = useCallback(async (inactive: boolean) => {
    setLoading(true)
    setError(null)
    try {
      setCustomers(await api.customers('', { all: inactive, stats: true }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tRef.current.customers.errLoad)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(showInactive)
  }, [load, showInactive])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!draft.fullName.trim()) {
      setFormErr(t.customers.nameRequired)
      return
    }
    const wantsAddress = draft.street.trim() || draft.city.trim() || draft.state.trim()
    if (wantsAddress && (!draft.street.trim() || !draft.city.trim() || !draft.state.trim())) {
      setFormErr(t.customers.addressNeeds)
      return
    }
    setCreating(true)
    setFormErr(null)
    try {
      const address: AddressInput | undefined = wantsAddress
        ? {
            street: draft.street.trim(),
            number: draft.number.trim() || null,
            district: draft.district.trim() || null,
            city: draft.city.trim(),
            state: draft.state.trim().toUpperCase(),
            zipCode: draft.zipCode.trim() || null,
          }
        : undefined
      await api.createCustomer({
        fullName: draft.fullName.trim(),
        phone: draft.phone.trim() || null,
        notes: draft.notes.trim() || null,
        address,
      })
      setDraft(BLANK)
      await load(showInactive)
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : t.customers.errCreate)
    } finally {
      setCreating(false)
    }
  }

  const col = t.customers.col

  return (
    <div className="custs">
      <header className="custs__bar">
        <button type="button" className="btn--link" onClick={() => navigate('/')}>
          {t.common.board}
        </button>
        <span className="custs__brand">{t.customers.title}</span>
        <span className="custs__spacer" />
        {user && <span className="custs__user">{user.fullName}</span>}
        <LanguageToggle />
        <ThemeToggle />
        <button type="button" className="btn" onClick={logout}>
          {t.common.logOut}
        </button>
      </header>

      <main className="custs__main">
        <form className="custs__new" onSubmit={handleCreate}>
          <h2 className="custs__h2">{t.customers.newCustomer}</h2>
          {formErr && <p className="form-error">{formErr}</p>}
          <div className="custs__new-grid">
            <label className="field">
              <span>{t.customers.nameReq}</span>
              <input
                value={draft.fullName}
                onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
                autoFocus
              />
            </label>
            <label className="field">
              <span>{t.customers.phone}</span>
              <input
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              />
            </label>
            <label className="field custs__new-notes">
              <span>{t.customers.notes}</span>
              <input
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </label>
          </div>
          <p className="custs__new-hint">{t.customers.firstAddress}</p>
          <div className="custs__new-grid">
            <label className="field">
              <span>{t.addr.street}</span>
              <input
                value={draft.street}
                onChange={(e) => setDraft((d) => ({ ...d, street: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>{t.addr.number}</span>
              <input
                value={draft.number}
                onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>{t.addr.district}</span>
              <input
                value={draft.district}
                onChange={(e) => setDraft((d) => ({ ...d, district: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>{t.addr.city}</span>
              <input
                value={draft.city}
                onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>{t.addr.state}</span>
              <input
                maxLength={2}
                value={draft.state}
                onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>{t.addr.zip}</span>
              <input
                value={draft.zipCode}
                onChange={(e) => setDraft((d) => ({ ...d, zipCode: e.target.value }))}
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={creating}>
              {creating ? t.common.adding : t.customers.addCustomer}
            </button>
          </div>
        </form>

        <label className="custs__toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {t.common.showInactive}
        </label>

        {loading && <p className="custs__note">{t.common.loading}</p>}
        {error && !loading && <p className="form-error">{error}</p>}
        {!loading && !error && customers.length === 0 && (
          <p className="custs__note">{t.customers.empty}</p>
        )}

        {!loading && customers.length > 0 && (
          <div className="custs__tablewrap">
            <table className="custs__table">
              <thead>
                <tr>
                  <th className="custs__col-name">{col.name}</th>
                  <th>{col.phone}</th>
                  <th>{col.notes}</th>
                  <th className="custs__num">{col.total}</th>
                  <th className="custs__num">{col.delivered}</th>
                  <th className="custs__num">{col.failed}</th>
                  <th className="custs__num">{col.absent}</th>
                  <th className="custs__num">{col.inProgress}</th>
                  <th className="custs__num">{col.pending}</th>
                  <th className="custs__num">{col.success}</th>
                  <th>{col.lastDelivery}</th>
                  <th className="custs__num">{col.deliveredValue}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <CustomerRow key={c.id} customer={c} onChanged={() => load(showInactive)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function CustomerRow({
  customer,
  onChanged,
}: {
  customer: Customer
  onChanged: () => void
}) {
  const t = useT()
  const [fullName, setFullName] = useState(customer.fullName)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [open, setOpen] = useState(false)

  const locked = customer.hasActivity
  const s = customer.stats
  const finished = s ? s.delivered + s.failed + s.absent : 0

  const dirty =
    fullName !== customer.fullName ||
    phone !== (customer.phone ?? '') ||
    notes !== (customer.notes ?? '')

  async function save(nextActive?: boolean) {
    setBusy(true)
    setErr(null)
    try {
      await api.updateCustomer(customer.id, {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        isActive: nextActive ?? customer.isActive,
      })
      onChanged()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.customers.errSave)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setErr(null)
    try {
      await api.deleteCustomer(customer.id)
      onChanged()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.customers.errDelete)
      setBusy(false)
      setConfirmDel(false)
    }
  }

  return (
    <>
      <tr className={customer.isActive ? undefined : 'custs__row--off'}>
        <td className="custs__col-name">
          <button
            type="button"
            className="custs__expand"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            title={t.customers.addresses}
          >
            {open ? '▾' : '▸'}
          </button>
          <input
            className="custs__in"
            value={fullName}
            disabled={locked}
            title={locked ? t.customers.lockTip : undefined}
            onChange={(e) => setFullName(e.target.value)}
          />
        </td>
        <td>
          <input className="custs__in" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </td>
        <td>
          <input className="custs__in" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </td>
        <td className="custs__num">{s?.total ?? 0}</td>
        <td className="custs__num">{s?.delivered ?? 0}</td>
        <td className="custs__num">{s?.failed ?? 0}</td>
        <td className="custs__num">{s?.absent ?? 0}</td>
        <td className="custs__num">{s?.inProgress ?? 0}</td>
        <td className="custs__num">{s?.pending ?? 0}</td>
        <td className="custs__num">{finished > 0 ? `${s?.successRate ?? 0}%` : t.common.none}</td>
        <td>{s?.lastDeliveryDate ? isoToBR(s.lastDeliveryDate) : t.common.none}</td>
        <td className="custs__num">{money(s?.deliveredValue ?? 0)}</td>
        <td className="custs__row-actions">
          {err && <span className="custs__row-err">{err}</span>}
          {dirty && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy}
              onClick={() => save()}
            >
              {t.common.save}
            </button>
          )}
          {customer.isActive && locked && (
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => save(false)}
            >
              {t.common.deactivate}
            </button>
          )}
          {!customer.isActive && (
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => save(true)}
            >
              {t.common.reactivate}
            </button>
          )}
          {!locked &&
            (confirmDel ? (
              <>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  disabled={busy}
                  onClick={remove}
                >
                  {t.common.confirmDelete}
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() => setConfirmDel(false)}
                >
                  {t.common.cancel}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() => setConfirmDel(true)}
              >
                {t.common.delete}
              </button>
            ))}
        </td>
      </tr>
      {open && (
        <tr className="custs__addr-row">
          <td colSpan={13}>
            <AddressManager customer={customer} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  )
}

function toInput(a: Address): AddressInput {
  return {
    street: a.street,
    number: a.number,
    district: a.district,
    city: a.city,
    state: a.state,
    zipCode: a.zipCode,
    complement: a.complement,
  }
}

function AddressManager({
  customer,
  onChanged,
}: {
  customer: Customer
  onChanged: () => void
}) {
  const t = useT()
  const [adding, setAdding] = useState<AddressInput>({ street: '', city: '', state: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!adding.street.trim() || !adding.city.trim() || !adding.state.trim()) {
      setErr(t.customers.streetCityStateReq)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await api.addAddress(customer.id, {
        ...adding,
        street: adding.street.trim(),
        city: adding.city.trim(),
        state: adding.state.trim().toUpperCase(),
      })
      setAdding({ street: '', city: '', state: '' })
      onChanged()
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t.customers.errAddressAdd)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="custs__addrs">
      <h3 className="custs__addrs-h">{t.customers.addresses}</h3>
      {customer.addresses.length === 0 && (
        <p className="custs__note">{t.customers.noAddresses}</p>
      )}
      {customer.addresses.map((a) => (
        <AddressRow key={a.id} customerId={customer.id} address={a} onChanged={onChanged} />
      ))}

      <form className="custs__addr-add" onSubmit={add}>
        {err && <p className="form-error">{err}</p>}
        <input
          placeholder={t.addr.street}
          value={adding.street}
          onChange={(e) => setAdding((v) => ({ ...v, street: e.target.value }))}
        />
        <input
          placeholder={t.addr.numberShort}
          className="custs__in--sm"
          value={adding.number ?? ''}
          onChange={(e) => setAdding((v) => ({ ...v, number: e.target.value }))}
        />
        <input
          placeholder={t.addr.district}
          value={adding.district ?? ''}
          onChange={(e) => setAdding((v) => ({ ...v, district: e.target.value }))}
        />
        <input
          placeholder={t.addr.city}
          value={adding.city}
          onChange={(e) => setAdding((v) => ({ ...v, city: e.target.value }))}
        />
        <input
          placeholder={t.addr.stateShort}
          className="custs__in--sm"
          maxLength={2}
          value={adding.state}
          onChange={(e) => setAdding((v) => ({ ...v, state: e.target.value }))}
        />
        <input
          placeholder={t.addr.zip}
          className="custs__in--sm"
          value={adding.zipCode ?? ''}
          onChange={(e) => setAdding((v) => ({ ...v, zipCode: e.target.value }))}
        />
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
          {t.customers.addAddress}
        </button>
      </form>
    </div>
  )
}

function AddressRow({
  customerId,
  address,
  onChanged,
}: {
  customerId: string
  address: Address
  onChanged: () => void
}) {
  const t = useT()
  const [form, setForm] = useState<AddressInput>(toInput(address))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const dirty =
    form.street !== address.street ||
    (form.number ?? '') !== (address.number ?? '') ||
    (form.district ?? '') !== (address.district ?? '') ||
    form.city !== address.city ||
    form.state !== address.state ||
    (form.zipCode ?? '') !== (address.zipCode ?? '')

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await api.updateAddress(customerId, address.id, {
        ...form,
        street: form.street.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
      })
      onChanged()
    } catch (e) {
      // A 409 here is the "delivery in progress" warning — surface it as-is.
      setMsg(e instanceof ApiError ? e.message : t.customers.errAddressSave)
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setMsg(null)
    try {
      await api.deleteAddress(customerId, address.id)
      onChanged()
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t.customers.errAddressRemove)
      setBusy(false)
      setConfirmDel(false)
    }
  }

  return (
    <div className="custs__addr">
      <div className="custs__addr-fields">
        <input
          value={form.street}
          onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
          placeholder={t.addr.street}
        />
        <input
          className="custs__in--sm"
          value={form.number ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
          placeholder={t.addr.numberShort}
        />
        <input
          value={form.district ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
          placeholder={t.addr.district}
        />
        <input
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          placeholder={t.addr.city}
        />
        <input
          className="custs__in--sm"
          maxLength={2}
          value={form.state}
          onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
          placeholder={t.addr.stateShort}
        />
        <input
          className="custs__in--sm"
          value={form.zipCode ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
          placeholder={t.addr.zip}
        />
      </div>
      <div className="custs__addr-actions">
        {dirty && (
          <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={save}>
            {t.common.save}
          </button>
        )}
        {confirmDel ? (
          <>
            <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={remove}>
              {t.common.confirm}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => setConfirmDel(false)}
            >
              {t.common.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => setConfirmDel(true)}
          >
            {t.common.remove}
          </button>
        )}
      </div>
      {msg && <p className="custs__addr-msg">{msg}</p>}
    </div>
  )
}
