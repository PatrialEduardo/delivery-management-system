import { useEffect, useMemo, useState } from 'react'
import { api, ApiError, type Delivery, type LineInput, type Product } from '../lib/api'
import { money } from '../lib/money'
import { Modal } from './Modal'
import './delivery-products.css'

interface Props {
  delivery: Delivery
  shippingCode: string
  onClose: () => void
  onSaved: () => void
}

interface Row {
  key: string
  productId: string
  quantity: string
  unitPrice: string
  notes: string
}

let seq = 0
const blankRow = (): Row => ({
  key: `r${++seq}`,
  productId: '',
  quantity: '1',
  unitPrice: '',
  notes: '',
})

const num = (s: string): number | null => {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function DeliveryProductsModal({ delivery, shippingCode, onClose, onSaved }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([api.products(), api.deliveryProducts(delivery.id)])
      .then(([prods, lines]) => {
        if (!alive) return
        setProducts(prods)
        setRows(
          lines.lines.length > 0
            ? lines.lines.map((l) => ({
                key: `r${++seq}`,
                productId: l.productId,
                quantity: String(l.quantity),
                unitPrice: l.unitPrice == null ? '' : String(l.unitPrice),
                notes: l.notes ?? '',
              }))
            : [blankRow()],
        )
      })
      .catch((e) => {
        if (alive) setErr(e instanceof ApiError ? e.message : 'Could not load the line items.')
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [delivery.id])

  function patch(key: string, next: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)))
  }

  function pickProduct(key: string, productId: string) {
    const p = products.find((x) => x.id === productId)
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r
        // Prefill the price from the catalogue only when the cell is empty.
        const unitPrice =
          r.unitPrice.trim() === '' && p?.price != null ? String(p.price) : r.unitPrice
        return { ...r, productId, unitPrice }
      }),
    )
  }

  const total = useMemo(
    () =>
      rows.reduce((sum, r) => {
        const q = num(r.quantity)
        const p = num(r.unitPrice)
        return q != null && p != null ? sum + q * p : sum
      }, 0),
    [rows],
  )

  const filled = rows.filter((r) => r.productId !== '')
  const invalid = filled.some((r) => {
    const q = num(r.quantity)
    return q == null || q <= 0 || (r.unitPrice !== '' && (num(r.unitPrice) ?? -1) < 0)
  })

  async function save() {
    if (invalid) {
      setErr('Every product row needs a quantity greater than 0.')
      return
    }
    setBusy(true)
    setErr(null)
    const lines: LineInput[] = filled.map((r) => ({
      productId: r.productId,
      quantity: num(r.quantity) ?? 0,
      unitPrice: num(r.unitPrice),
      notes: r.notes.trim() || null,
    }))
    try {
      await api.setDeliveryProducts(delivery.id, lines)
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the line items.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Items · ${delivery.customerName}`}
      onClose={onClose}
      footer={
        <>
          <span className="dp__total">
            {filled.length} item{filled.length === 1 ? '' : 's'} · <strong>{money(total)}</strong>
          </span>
          <span className="dp__foot-spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy || loading}>
            {busy ? 'Saving…' : 'Save items'}
          </button>
        </>
      }
    >
      <p className="dp__ctx">
        {shippingCode} · stop {delivery.order} · {delivery.addressLine}
      </p>
      {err && <p className="form-error">{err}</p>}

      {loading ? (
        <p className="dp__note">Loading…</p>
      ) : products.length === 0 ? (
        <p className="form-error">
          No products in the catalogue yet. Add some on the Products screen first.
        </p>
      ) : (
        <>
          <div className="dp__grid" role="table">
            <div className="dp__grid-head" role="row">
              <span>Product</span>
              <span>Qty</span>
              <span>Unit price</span>
              <span>Line</span>
              <span />
            </div>
            {rows.map((r) => {
              const q = num(r.quantity)
              const p = num(r.unitPrice)
              const lineTotal = q != null && p != null ? q * p : null
              return (
                <div className="dp__grid-row" role="row" key={r.key}>
                  <select
                    value={r.productId}
                    onChange={(e) => pickProduct(r.key, e.target.value)}
                    aria-label="Product"
                  >
                    <option value="">Select…</option>
                    {products.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.name}
                        {prod.unit ? ` (${prod.unit})` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.quantity}
                    onChange={(e) => patch(r.key, { quantity: e.target.value })}
                    aria-label="Quantity"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.unitPrice}
                    onChange={(e) => patch(r.key, { unitPrice: e.target.value })}
                    placeholder="—"
                    aria-label="Unit price"
                  />
                  <span className="dp__line-total">{lineTotal == null ? '—' : money(lineTotal)}</span>
                  <button
                    type="button"
                    className="dp__x"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label="Remove row"
                  >
                    &times;
                  </button>
                  {r.productId !== '' && (
                    <input
                      className="dp__notes"
                      value={r.notes}
                      onChange={(e) => patch(r.key, { notes: e.target.value })}
                      placeholder="Note for this line (optional)"
                      aria-label="Line note"
                    />
                  )}
                </div>
              )
            })}
          </div>
          <button
            type="button"
            className="btn btn--link dp__add"
            onClick={() => setRows((rs) => [...rs, blankRow()])}
          >
            + Add row
          </button>
        </>
      )}
    </Modal>
  )
}
