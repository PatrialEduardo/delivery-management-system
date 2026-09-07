import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT, type Messages } from '../context/LanguageContext'
import { api, ApiError, type Product, type ProductInput } from '../lib/api'
import { ThemeToggle } from '../components/ThemeToggle'
import { LanguageToggle } from '../components/LanguageToggle'
import '../components/ui.css'
import './ProductsPage.css'

const BLANK: ProductInput = { name: '', sku: '', unit: '', price: null }

export function ProductsPage() {
  const { user, logout } = useAuth()
  const t = useT()
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const navigate = useNavigate()

  const [products, setProducts] = useState<Product[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProductInput>(BLANK)
  const [creating, setCreating] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const load = useCallback(async (inactive: boolean) => {
    setLoading(true)
    setError(null)
    try {
      setProducts(await api.products(inactive))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tRef.current.products.errLoad)
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
    if (!draft.name.trim()) {
      setFormErr(t.products.nameRequired)
      return
    }
    setCreating(true)
    setFormErr(null)
    try {
      await api.createProduct({
        name: draft.name.trim(),
        sku: draft.sku?.trim() || null,
        unit: draft.unit?.trim() || null,
        price: draft.price ?? null,
      })
      setDraft(BLANK)
      await load(showInactive)
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : t.products.errCreate)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="prods">
      <header className="prods__bar">
        <button type="button" className="btn--link" onClick={() => navigate('/')}>
          {t.common.board}
        </button>
        <span className="prods__brand">{t.products.title}</span>
        <span className="prods__spacer" />
        {user && <span className="prods__user">{user.fullName}</span>}
        <LanguageToggle />
        <ThemeToggle />
        <button type="button" className="btn" onClick={logout}>
          {t.common.logOut}
        </button>
      </header>

      <main className="prods__main">
        <form className="prods__new" onSubmit={handleCreate}>
          <h2 className="prods__h2">{t.products.newProduct}</h2>
          {formErr && <p className="form-error">{formErr}</p>}
          <div className="prods__new-grid">
            <label className="field">
              <span>{t.products.name}</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={t.products.namePlaceholder}
                autoFocus
              />
            </label>
            <label className="field">
              <span>{t.products.sku}</span>
              <input
                value={draft.sku ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
                placeholder={t.products.skuPlaceholder}
              />
            </label>
            <label className="field">
              <span>{t.products.unit}</span>
              <input
                value={draft.unit ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                placeholder={t.products.unitPlaceholder}
              />
            </label>
            <label className="field">
              <span>{t.products.price}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    price: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                placeholder={t.products.pricePlaceholder}
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={creating}>
              {creating ? t.common.adding : t.common.add}
            </button>
          </div>
        </form>

        <label className="prods__toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {t.common.showInactive}
        </label>

        {loading && <p className="prods__note">{t.common.loading}</p>}
        {error && !loading && <p className="form-error">{error}</p>}
        {!loading && !error && products.length === 0 && (
          <p className="prods__note">{t.products.empty}</p>
        )}

        {!loading && products.length > 0 && (
          <ul className="prods__list">
            <li className="prods__head" aria-hidden="true">
              <span>{t.products.name}</span>
              <span>{t.products.sku}</span>
              <span>{t.products.unit}</span>
              <span>{t.products.price}</span>
              <span />
            </li>
            {products.map((p) => (
              <ProductRow key={p.id} product={p} t={t} onSaved={() => load(showInactive)} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function ProductRow({
  product,
  t,
  onSaved,
}: {
  product: Product
  t: Messages
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProductInput>({
    name: product.name,
    sku: product.sku ?? '',
    unit: product.unit ?? '',
    price: product.price,
    isActive: product.isActive,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  // Once the product is on a delivery line, its identity fields freeze and
  // it can only be deactivated (never deleted).
  const locked = product.hasActivity
  const lockTip = locked ? t.products.lockTip : undefined

  const dirty = locked
    ? (form.price ?? null) !== (product.price ?? null)
    : form.name !== product.name ||
      (form.sku ?? '') !== (product.sku ?? '') ||
      (form.unit ?? '') !== (product.unit ?? '') ||
      (form.price ?? null) !== (product.price ?? null)

  async function save(next?: Partial<ProductInput>) {
    setBusy(true)
    setErr(null)
    try {
      await api.updateProduct(product.id, {
        name: form.name.trim(),
        sku: form.sku?.trim() || null,
        unit: form.unit?.trim() || null,
        price: form.price ?? null,
        isActive: next?.isActive ?? form.isActive ?? true,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.products.errSave)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setErr(null)
    try {
      await api.deleteProduct(product.id)
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.products.errDelete)
      setBusy(false)
      setConfirmDel(false)
    }
  }

  return (
    <li className={`prods__row${product.isActive ? '' : ' prods__row--off'}`}>
      <input
        className="prods__in"
        value={form.name}
        disabled={locked}
        title={lockTip}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
      />
      <input
        className="prods__in"
        value={form.sku ?? ''}
        disabled={locked}
        title={lockTip}
        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
      />
      <input
        className="prods__in prods__in--sm"
        value={form.unit ?? ''}
        disabled={locked}
        title={lockTip}
        onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
      />
      <input
        className="prods__in prods__in--sm"
        type="number"
        min="0"
        step="0.01"
        value={form.price ?? ''}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            price: e.target.value === '' ? null : Number(e.target.value),
          }))
        }
      />
      <span className="prods__row-actions">
        {err && <span className="prods__row-err">{err}</span>}
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
        {product.isActive && locked && (
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => save({ isActive: false })}
          >
            {t.common.deactivate}
          </button>
        )}
        {!product.isActive && (
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => save({ isActive: true })}
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
      </span>
    </li>
  )
}
