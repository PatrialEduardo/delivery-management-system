import { useEffect, useMemo, useState } from 'react'
import { api, ApiError, type Delivery, type LineInput, type Product } from '../lib/api'
import { money } from '../lib/money'
import { useT } from '../context/LanguageContext'
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
  const t = useT()
  const [products, setProducts] = useState<Product[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Line items are frozen once the driver has started (or finished) the stop.
  const locked =
    delivery.statusCode !== 'PENDING' && delivery.statusCode !== 'ASSIGNED'

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
        if (alive) setErr(e instanceof ApiError ? e.message : t.deliveryProducts.errLoad)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [delivery.id, t])

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
      setErr(t.deliveryProducts.qtyPositive)
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
      setErr(e instanceof ApiError ? e.message : t.deliveryProducts.errSave)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t.deliveryProducts.title(delivery.customerName)}
      onClose={onClose}
      footer={
        <>
          <span className="dp__total">
            {t.deliveryProducts.itemCount(filled.length)} · <strong>{money(total)}</strong>
          </span>
          <span className="dp__foot-spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={save}
            disabled={busy || loading || locked}
          >
            {busy ? t.common.saving : t.deliveryProducts.saveItems}
          </button>
        </>
      }
    >
      <p className="dp__ctx">
        {t.deliveryProducts.ctx(shippingCode, delivery.order, delivery.addressLine)}
      </p>
      {locked && <p className="dp__note">{t.deliveryProducts.locked}</p>}
      {err && <p className="form-error">{err}</p>}

      {loading ? (
        <p className="dp__note">{t.common.loading}</p>
      ) : products.length === 0 ? (
        <p className="form-error">{t.deliveryProducts.noCatalogue}</p>
      ) : (
        <>
          <div className="dp__grid" role="table">
            <div className="dp__grid-head" role="row">
              <span>{t.deliveryProducts.product}</span>
              <span>{t.deliveryProducts.qty}</span>
              <span>{t.deliveryProducts.unitPrice}</span>
              <span>{t.deliveryProducts.line}</span>
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
                    aria-label={t.deliveryProducts.product}
                    disabled={locked}
                  >
                    <option value="">{t.deliveryProducts.selectProduct}</option>
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
                    aria-label={t.deliveryProducts.qty}
                    disabled={locked}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.unitPrice}
                    onChange={(e) => patch(r.key, { unitPrice: e.target.value })}
                    placeholder="—"
                    aria-label={t.deliveryProducts.unitPrice}
                    disabled={locked}
                  />
                  <span className="dp__line-total">{lineTotal == null ? '—' : money(lineTotal)}</span>
                  <button
                    type="button"
                    className="dp__x"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label={t.deliveryProducts.removeRow}
                    disabled={locked}
                  >
                    &times;
                  </button>
                  {r.productId !== '' && (
                    <input
                      className="dp__notes"
                      value={r.notes}
                      onChange={(e) => patch(r.key, { notes: e.target.value })}
                      placeholder={t.deliveryProducts.lineNotePlaceholder}
                      aria-label={t.deliveryProducts.lineNotePlaceholder}
                      disabled={locked}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {!locked && (
            <button
              type="button"
              className="btn btn--link dp__add"
              onClick={() => setRows((rs) => [...rs, blankRow()])}
            >
              {t.deliveryProducts.addRow}
            </button>
          )}
        </>
      )}
    </Modal>
  )
}
