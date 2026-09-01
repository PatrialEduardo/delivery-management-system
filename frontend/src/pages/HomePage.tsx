import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  api,
  ApiError,
  type Customer,
  type Driver,
  type HomePayload,
  type Shipping,
  type StatusCount,
} from '../lib/api'
import { ShippingSection } from '../components/ShippingSection'
import { NewShippingModal } from '../components/NewShippingModal'
import { AddDeliveryModal } from '../components/AddDeliveryModal'
import { LinkDeliveryModal } from '../components/LinkDeliveryModal'
import './HomePage.css'

type ModalState =
  | null
  | { kind: 'newShipping' }
  | { kind: 'addDelivery'; shippingId?: number }
  | { kind: 'link'; shipping: Shipping }

export function HomePage() {
  const { user, logout } = useAuth()

  const [date, setDate] = useState('') // '' → let the server pick "today"
  const [payload, setPayload] = useState<HomePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<ModalState>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setError(null)
    try {
      const p = await api.shippings(d)
      setPayload(p)
      setDate(p.date)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshCustomers = useCallback(async () => {
    try {
      setCustomers(await api.customers())
    } catch {
      /* non-fatal — the picker just shows what it has */
    }
  }, [])

  useEffect(() => {
    // Initial sync with the API on mount. load() flips a loading flag
    // synchronously, which the set-state-in-effect rule flags; that is the
    // intended behaviour for a first data fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('')
    api.drivers().then(setDrivers).catch(() => {})
    refreshCustomers()
  }, [load, refreshCustomers])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function changeDate(next: string) {
    setDate(next)
    load(next)
  }

  function toggle(id: number) {
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const reorder = useCallback(
    async (shippingId: number, ids: number[]) => {
      // optimistic: renumber locally right away
      setPayload((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          shippings: prev.shippings.map((s) => {
            if (s.id !== shippingId) return s
            const byId = new Map(s.deliveries.map((d) => [d.id, d]))
            const next = ids
              .map((id, i) => {
                const d = byId.get(id)
                return d ? { ...d, order: i + 1 } : undefined
              })
              .filter((d): d is (typeof s.deliveries)[number] => d !== undefined)
            return { ...s, deliveries: next }
          }),
        }
      })

      try {
        const { deliveries } = await api.reorderDeliveries(shippingId, ids)
        setPayload((prev) =>
          prev
            ? {
                ...prev,
                shippings: prev.shippings.map((s) =>
                  s.id === shippingId ? { ...s, deliveries } : s,
                ),
              }
            : prev,
        )
      } catch {
        setToast('Could not save the new order — reloading.')
        load(date)
      }
    },
    [date, load],
  )

  async function handleCreateShipping(body: {
    driverUserId: string
    deliveryDate: string
    notes?: string | null
  }) {
    await api.createShipping(body)
    setModal(null)
    setDate(body.deliveryDate)
    await load(body.deliveryDate)
  }

  async function handleAddDelivery(
    shippingId: number,
    body: { customerId: string; addressId: string; notes?: string | null },
  ) {
    await api.quickAddDelivery(shippingId, body)
    setModal(null)
    await load(date)
  }

  async function handleLinked() {
    setModal(null)
    await load(date)
  }

  const shippings = payload?.shippings ?? []
  const summary: StatusCount[] = payload?.statusSummary ?? []

  return (
    <div className="home">
      <header className="home__topbar">
        <button
          type="button"
          className="home__hamburger"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>
        <span className="home__brand">DMS</span>
        <input
          className="home__date"
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          aria-label="Delivery date"
        />
        <span className="home__spacer" />
        {user && <span className="home__user">{user.fullName}</span>}
        <button type="button" className="btn home__logout" onClick={logout}>
          Log out
        </button>
      </header>

      <div className="home__summary" role="list" aria-label="Status summary">
        {summary.length === 0 && <span className="home__summary-empty">No deliveries.</span>}
        {summary.map((s) => (
          <span className="chip" role="listitem" key={s.statusId}>
            <span className="chip__dot" style={{ background: s.colorHex }} />
            <span className="chip__name">{s.name}</span>
            <span className="chip__count">{s.count}</span>
          </span>
        ))}
      </div>

      <div className="home__body">
        {menuOpen && <div className="home__scrim" onClick={() => setMenuOpen(false)} />}
        <aside className={`home__sidebar${menuOpen ? ' home__sidebar--open' : ''}`}>
          <button
            type="button"
            className="btn btn--primary home__action"
            onClick={() => {
              setModal({ kind: 'newShipping' })
              setMenuOpen(false)
            }}
          >
            + New shipping
          </button>
          <button
            type="button"
            className="btn home__action"
            onClick={() => {
              setModal({ kind: 'addDelivery' })
              setMenuOpen(false)
            }}
          >
            + New delivery
          </button>
        </aside>

        <main className="home__main">
          {loading && <p className="home__note">Loading…</p>}
          {error && !loading && <p className="home__error">{error}</p>}
          {!loading && !error && shippings.length === 0 && (
            <div className="home__empty">
              <p>No shippings for {date || 'today'}.</p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setModal({ kind: 'newShipping' })}
              >
                + New shipping
              </button>
            </div>
          )}

          {!loading &&
            !error &&
            shippings.map((s) => (
              <ShippingSection
                key={s.id}
                shipping={s}
                collapsed={collapsed.has(s.id)}
                onToggle={() => toggle(s.id)}
                onReorder={reorder}
                onAddDelivery={(shippingId) => setModal({ kind: 'addDelivery', shippingId })}
                onLink={(shipping) => setModal({ kind: 'link', shipping })}
              />
            ))}
        </main>
      </div>

      {toast && <div className="home__toast">{toast}</div>}

      {modal?.kind === 'newShipping' && (
        <NewShippingModal
          drivers={drivers}
          defaultDate={date}
          onClose={() => setModal(null)}
          onCreate={handleCreateShipping}
        />
      )}

      {modal?.kind === 'addDelivery' && (
        <AddDeliveryModal
          shippings={shippings}
          fixedShippingId={modal.shippingId}
          customers={customers}
          onCustomersChanged={refreshCustomers}
          onClose={() => setModal(null)}
          onAdd={handleAddDelivery}
        />
      )}

      {modal?.kind === 'link' && (
        <LinkDeliveryModal
          shipping={modal.shipping}
          date={date}
          onClose={() => setModal(null)}
          onLinked={handleLinked}
        />
      )}
    </div>
  )
}
