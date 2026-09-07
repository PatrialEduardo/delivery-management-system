import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LanguageContext'
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
import { statusLabel } from '../lib/status'
import { ThemeToggle } from '../components/ThemeToggle'
import { LanguageToggle } from '../components/LanguageToggle'
import { ShippingSection } from '../components/ShippingSection'
import { NewShippingModal } from '../components/NewShippingModal'
import { AddDeliveryModal } from '../components/AddDeliveryModal'
import { LinkDeliveryModal } from '../components/LinkDeliveryModal'
import { DeliveryProductsModal } from '../components/DeliveryProductsModal'
import { toLocalISODate, isoToBR } from '../lib/date'
import './HomePage.css'

const MAX_RANGE_DAYS = 92

/** Whole days between two YYYY-MM-DD strings (order-independent). */
function spanDays(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))
  return Math.round(ms / 86_400_000)
}

type ModalState =
  | null
  | { kind: 'newShipping' }
  | { kind: 'addDelivery'; shippingId?: number }
  | { kind: 'link'; shipping: Shipping }
  | { kind: 'deliveryProducts'; delivery: Delivery; shippingCode: string }

export function HomePage() {
  const { user, logout } = useAuth()
  const t = useT()
  // Keep a stable ref so data-loading callbacks don't churn (and re-fetch,
  // resetting the date range) every time the language changes.
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const navigate = useNavigate()

  // The board is a *date range* (dd/MM/yyyy – dd/MM/yyyy). It defaults to a
  // single day — the viewer's local day, not the server's clock (the API's
  // "today" can drift, e.g. a container in UTC).
  const [from, setFrom] = useState(() => toLocalISODate())
  const [to, setTo] = useState(() => toLocalISODate())
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

  const load = useCallback(async (f: string, tt: string) => {
    setLoading(true)
    setError(null)
    try {
      const p = await api.shippings(f, tt)
      setPayload(p)
      setFrom(p.from)
      setTo(p.to)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tRef.current.common.serverError)
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
    load(toLocalISODate(), toLocalISODate())
    api.drivers().then(setDrivers).catch(() => {})
    refreshCustomers()
  }, [load, refreshCustomers])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  // Apply a new range: clamp it coherent, reject an over-wide span with a
  // translated message before hitting the API, otherwise reload.
  function applyRange(f: string, tt: string) {
    setFrom(f)
    setTo(tt)
    if (spanDays(f, tt) > MAX_RANGE_DAYS) {
      setPayload(null)
      setLoading(false)
      setError(t.home.rangeTooWide)
      return
    }
    load(f, tt)
  }

  function changeFrom(next: string) {
    const f = next || toLocalISODate()
    applyRange(f, f > to ? f : to)
  }

  function changeTo(next: string) {
    const tt = next || toLocalISODate()
    applyRange(tt < from ? tt : from, tt)
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
      } catch (e) {
        setToast(e instanceof ApiError ? e.message : tRef.current.home.reorderFailed)
        load(from, to)
      }
    },
    [from, to, load],
  )

  async function handleCreateShipping(body: {
    driverUserId: string
    deliveryDate: string
    notes?: string | null
  }) {
    await api.createShipping(body)
    setModal(null)
    setFrom(body.deliveryDate)
    setTo(body.deliveryDate)
    await load(body.deliveryDate, body.deliveryDate)
  }

  async function handleAddDelivery(
    shippingId: number,
    body: { customerId: string; addressId: string; notes?: string | null },
  ) {
    await api.quickAddDelivery(shippingId, body)
    setModal(null)
    await load(from, to)
  }

  async function handleLinked() {
    setModal(null)
    await load(from, to)
  }

  const shippings = payload?.shippings ?? []
  const summary: StatusCount[] = payload?.statusSummary ?? []
  const rangeLabel =
    from === to ? isoToBR(from) : `${isoToBR(from)} – ${isoToBR(to)}`

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
          aria-label={t.common.openMenu}
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>
        <span className="home__brand">DMS</span>
        <div className="home__ranges">
          <label className="home__range">
            <span className="home__range-cap">{t.home.from}</span>
            <input
              className="home__date"
              type="date"
              value={from}
              max={to}
              onChange={(e) => changeFrom(e.target.value)}
              aria-label={t.home.fromAria}
            />
          </label>
          <label className="home__range">
            <span className="home__range-cap">{t.home.to}</span>
            <input
              className="home__date"
              type="date"
              value={to}
              min={from}
              onChange={(e) => changeTo(e.target.value)}
              aria-label={t.home.toAria}
            />
          </label>
          <span className="home__range-label" aria-hidden="true">
            {rangeLabel}
          </span>
        </div>
        <span className="home__spacer" />
        {user && <span className="home__user">{user.fullName}</span>}
        <ThemeToggle />
        <button type="button" className="btn home__logout" onClick={logout}>
          {t.common.logOut}
        </button>
      </header>

      <div className="home__summary" aria-label={t.home.filterByStatus}>
        {summary.length === 0 && (
          <span className="home__summary-empty">{t.home.noDeliveries}</span>
        )}
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
              <span className="chip__name">{statusLabel(t, s.code, s.name)}</span>
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
            {t.home.clear}
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
            {t.nav.newShipping}
          </button>
          <button
            type="button"
            className="btn home__action"
            onClick={() => {
              setModal({ kind: 'addDelivery' })
              setMenuOpen(false)
            }}
          >
            {t.nav.newDelivery}
          </button>
          <button
            type="button"
            className="btn home__action home__action--nav"
            onClick={() => navigate('/products')}
          >
            {t.nav.products}
          </button>
          <button
            type="button"
            className="btn home__action home__action--nav"
            onClick={() => navigate('/customers')}
          >
            {t.nav.customers}
          </button>
          <div className="home__sidebar-foot">
            <LanguageToggle />
          </div>
        </aside>

        <main className="home__main">
          {loading && <p className="home__note">{t.common.loading}</p>}
          {error && !loading && <p className="home__error">{error}</p>}
          {!loading && !error && shippings.length === 0 && (
            <div className="home__empty">
              <p>{t.home.noShippingsForRange(rangeLabel)}</p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setModal({ kind: 'newShipping' })}
              >
                {t.nav.newShipping}
              </button>
            </div>
          )}

          {!loading && !error && shippings.length > 0 && visibleShippings.length === 0 && (
            <p className="home__note">{t.home.noStopsMatch}</p>
          )}

          {!loading &&
            !error &&
            visibleShippings.map((s) => (
              <ShippingSection
                key={s.id}
                shipping={s}
                collapsed={collapsed.has(s.id)}
                disableReorder={filterActive}
                showDate={from !== to}
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
          defaultDate={from}
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
          date={modal.shipping.deliveryDate}
          onClose={() => setModal(null)}
          onLinked={handleLinked}
        />
      )}

      {modal?.kind === 'deliveryProducts' && (
        <DeliveryProductsModal
          delivery={modal.delivery}
          shippingCode={modal.shippingCode}
          onClose={() => setModal(null)}
          onSaved={() => load(from, to)}
        />
      )}
    </div>
  )
}
