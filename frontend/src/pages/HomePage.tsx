import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  api,
  ApiError,
  type Customer,
  type Delivery,
  type Driver,
  type HomePayload,
  type Shipping,
  type StatusCount,
} from '../lib/api'
import { ThemeToggle } from '../components/ThemeToggle'
import { ShippingSection } from '../components/ShippingSection'
import { NewShippingModal } from '../components/NewShippingModal'
import { AddDeliveryModal } from '../components/AddDeliveryModal'
import { LinkDeliveryModal } from '../components/LinkDeliveryModal'
import { DeliveryProductsModal } from '../components/DeliveryProductsModal'
import { toLocalISODate } from '../lib/date'
import './HomePage.css'

type ModalState =
  | null
  | { kind: 'newShipping' }
  | { kind: 'addDelivery'; shippingId?: number }
  | { kind: 'link'; shipping: Shipping }
  | { kind: 'deliveryProducts'; delivery: Delivery; shippingCode: string }

export function HomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Default the board to the viewer's local day, not the server's clock
  // (the API's "today" can drift from the user's — e.g. a container in UTC).
  const [date, setDate] = useState(() => toLocalISODate())
  const [payload, setPayload] = useState<HomePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  // Status ids to keep. Empty = show everything.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
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
    load(toLocalISODate())
    api.drivers().then(setDrivers).catch(() => {})
    refreshCustomers()
  }, [load, refreshCustomers])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function changeDate(next: string) {
    // The native date input can be cleared; fall back to the local day.
    const d = next || toLocalISODate()
    setDate(d)
    load(d)
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

  const filterActive = statusFilter.size > 0
  // When a status filter is on, keep only matching stops and drop shippings
  // that end up with none. Reorder is disabled in this view (the API needs
  // the full stop set to renumber).
  const visibleShippings = filterActive
    ? shippings
        .map((s) => ({
          ...s,
          deliveries: s.deliveries.filter((d) => statusFilter.has(d.statusId)),
        }))
        .filter((s) => s.deliveries.length > 0)
    : shippings

  function toggleStatus(statusId: string) {
    setStatusFilter((prev) => {
      const n = new Set(prev)
      if (n.has(statusId)) n.delete(statusId)
      else n.add(statusId)
      return n
    })
  }

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
        <ThemeToggle />
        <button type="button" className="btn home__logout" onClick={logout}>
          Log out
        </button>
      </header>

      <div className="home__summary" aria-label="Filter by status">
        {summary.length === 0 && <span className="home__summary-empty">No deliveries.</span>}
        {summary.map((s) => {
          const on = statusFilter.has(s.statusId)
          return (
            <button
              type="button"
              className={`chip chip--btn${on ? ' chip--on' : ''}${
                filterActive && !on ? ' chip--muted' : ''
              }`}
              key={s.statusId}
              aria-pressed={on}
              onClick={() => toggleStatus(s.statusId)}
            >
              <span className="chip__dot" style={{ background: s.colorHex }} />
              <span className="chip__name">{s.name}</span>
              <span className="chip__count">{s.count}</span>
            </button>
          )
        })}
        {filterActive && (
          <button
            type="button"
            className="chip chip--clear"
            onClick={() => setStatusFilter(new Set())}
          >
            Clear
          </button>
        )}
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
          <button
            type="button"
            className="btn home__action home__action--nav"
            onClick={() => navigate('/products')}
          >
            Products
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

          {!loading && !error && shippings.length > 0 && visibleShippings.length === 0 && (
            <p className="home__note">No stops match the selected status.</p>
          )}

          {!loading &&
            !error &&
            visibleShippings.map((s) => (
              <ShippingSection
                key={s.id}
                shipping={s}
                collapsed={collapsed.has(s.id)}
                disableReorder={filterActive}
                onToggle={() => toggle(s.id)}
                onReorder={reorder}
                onAddDelivery={(shippingId) => setModal({ kind: 'addDelivery', shippingId })}
                onOpenDelivery={(delivery) =>
                  setModal({ kind: 'deliveryProducts', delivery, shippingCode: s.batchCode })
                }
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

      {modal?.kind === 'deliveryProducts' && (
        <DeliveryProductsModal
          delivery={modal.delivery}
          shippingCode={modal.shippingCode}
          onClose={() => setModal(null)}
          onSaved={() => load(date)}
        />
      )}
    </div>
  )
}
