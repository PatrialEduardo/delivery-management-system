import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { Delivery, Shipping } from '../lib/api'
import { money } from '../lib/money'
import { DeliveryRow } from './DeliveryRow'

interface Props {
  shipping: Shipping
  collapsed: boolean
  /** hide drag-to-reorder (e.g. while a status filter is showing a partial stop list). */
  disableReorder?: boolean
  onToggle: () => void
  onReorder: (shippingId: number, deliveryIds: number[]) => void
  onAddDelivery: (shippingId: number) => void
  onOpenDelivery: (delivery: Delivery) => void
  onLink: (shipping: Shipping) => void
}

export function ShippingSection({
  shipping,
  collapsed,
  disableReorder = false,
  onToggle,
  onReorder,
  onAddDelivery,
  onOpenDelivery,
  onLink,
}: Props) {
  // Press-and-hold (delay) turns a touch/click into a drag, so a plain
  // tap on the row still behaves normally.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = shipping.deliveries.map((d) => d.id)
  const count = shipping.deliveries.length

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(Number(active.id))
    const newIndex = ids.indexOf(Number(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(shipping.id, arrayMove(ids, oldIndex, newIndex))
  }

  return (
    <section className="shipping">
      <header className="shipping__head">
        <button
          type="button"
          className="shipping__toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          <span className={`shipping__chev${collapsed ? '' : ' shipping__chev--open'}`} aria-hidden="true">
            ▸
          </span>
          <span className="shipping__code">{shipping.batchCode}</span>
          <span className="shipping__meta">
            {shipping.driverName} · {count} stop{count === 1 ? '' : 's'}
            {shipping.itemCount > 0 && (
              <>
                {' · '}
                {shipping.itemCount} item{shipping.itemCount === 1 ? '' : 's'} ·{' '}
                {money(shipping.itemTotal)}
              </>
            )}
          </span>
        </button>
        <button type="button" className="btn--link" onClick={() => onLink(shipping)}>
          Link existing
        </button>
      </header>

      {!collapsed && (
        <div className="shipping__body">
          {shipping.notes && <p className="shipping__notes">{shipping.notes}</p>}

          {count === 0 ? (
            <p className="shipping__empty">No stops yet.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul className="shipping__list">
                  {shipping.deliveries.map((d, i) => (
                    <DeliveryRow
                      key={d.id}
                      delivery={d}
                      index={i}
                      disabled={disableReorder}
                      onOpen={() => onOpenDelivery(d)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <button
            type="button"
            className="shipping__add"
            onClick={() => onAddDelivery(shipping.id)}
          >
            + Add delivery
          </button>
        </div>
      )}
    </section>
  )
}
