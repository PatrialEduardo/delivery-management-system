import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, ApiError, type Product, type ProductInput } from '../lib/api'
import { ThemeToggle } from '../components/ThemeToggle'
import '../components/ui.css'
import './ProductsPage.css'

const BLANK: ProductInput = { name: '', sku: '', unit: '', price: null }

export function ProductsPage() {
  const { user, logout } = useAuth()
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
      setError(e instanceof ApiError ? e.message : 'Could not load products.')
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
      setFormErr('Name is required.')
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
      setFormErr(e instanceof ApiError ? e.message : 'Could not create the product.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="prods">
      <header className="prods__bar">
        <button type="button" className="btn--link" onClick={() => navigate('/')}>
          ‹ Board
        </button>
        <span className="prods__brand">Products</span>
        <span className="prods__spacer" />
        {user && <span className="prods__user">{user.fullName}</span>}
        <ThemeToggle />
        <button type="button" className="btn" onClick={logout}>
          Log out
        </button>
      </header>

      <main className="prods__main">
        <form className="prods__new" onSubmit={handleCreate}>
          <h2 className="prods__h2">New product</h2>
          {formErr && <p className="form-error">{formErr}</p>}
          <div className="prods__new-grid">
            <label className="field">
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Galão de água 20L"
                autoFocus
              />
            </label>
            <label className="field">
              <span>SKU</span>
              <input
                value={draft.sku ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
                placeholder="optional"
              />
            </label>
            <label className="field">
              <span>Unit</span>
              <input
                value={draft.unit ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                placeholder="UN, CX, KG…"
              />
            </label>
            <label className="field">
              <span>Price</span>
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
                placeholder="0.00"
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={creating}>
              {creating ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>

        <label className="prods__toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>

        {loading && <p className="prods__note">Loading…</p>}
        {error && !loading && <p className="form-error">{error}</p>}
        {!loading && !error && products.length === 0 && (
          <p className="prods__note">No products yet. Add one above.</p>
        )}

        {!loading && products.length > 0 && (
          <ul className="prods__list">
            <li className="prods__head" aria-hidden="true">
              <span>Name</span>
              <span>SKU</span>
              <span>Unit</span>
              <span>Price</span>
              <span />
            </li>
            {products.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                onSaved={() => load(showInactive)}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function ProductRow({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const [form, setForm] = useState<ProductInput>({
    name: product.name,
    sku: product.sku ?? '',
    unit: product.unit ?? '',
    price: product.price,
    isActive: product.isActive,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const dirty =
    form.name !== product.name ||
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
      setErr(e instanceof ApiError ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    setBusy(true)
    setErr(null)
    try {
      await api.deleteProduct(product.id)
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not deactivate.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`prods__row${product.isActive ? '' : ' prods__row--off'}`}>
      <input
        className="prods__in"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
      />
      <input
        className="prods__in"
        value={form.sku ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
      />
      <input
        className="prods__in prods__in--sm"
        value={form.unit ?? ''}
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
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => save()}>
            Save
          </button>
        )}
        {product.isActive ? (
          <button type="button" className="btn btn--sm" disabled={busy} onClick={deactivate}>
            Deactivate
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => save({ isActive: true })}
          >
            Reactivate
          </button>
        )}
      </span>
    </li>
  )
}
