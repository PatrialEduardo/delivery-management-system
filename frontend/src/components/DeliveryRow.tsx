import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Delivery } from '../lib/api'
import { money } from '../lib/money'
import { useT } from '../context/LanguageContext'
import { statusLabel } from '../lib/status'

export function DeliveryRow({
  delivery,
  index,
  disabled = false,
  onOpen,
}: {
  delivery: Delivery
  index: number
  disabled?: boolean
  onOpen?: () => void
}) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: delivery.id,
    disabled,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className={`drow${isDragging ? ' drow--dragging' : ''}`}>
      {disabled ? (
        <span className="drow__handle drow__handle--off" aria-hidden="true">
          ⠿
        </span>
      ) : (
        <button
          type="button"
          className="drow__handle"
          aria-label={t.shipping.reorderAria(delivery.customerName)}
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}
      <span className="drow__order">{index + 1}</span>
      <button
        type="button"
        className="drow__body drow__body--btn"
        onClick={onOpen}
        title="Edit line items"
      >
        <span className="drow__name">{delivery.customerName}</span>
        <span className="drow__addr">{delivery.addressLine}</span>
        <span className="drow__items">
          {delivery.itemCount > 0
            ? `${t.shipping.items(delivery.itemCount)} · ${money(delivery.itemTotal)}`
            : t.shipping.addItems}
        </span>
      </button>
      <span className="status-badge" style={{ ['--c' as string]: delivery.statusColor }}>
        {statusLabel(t, delivery.statusCode, delivery.statusName)}
      </span>
    </li>
  )
}
