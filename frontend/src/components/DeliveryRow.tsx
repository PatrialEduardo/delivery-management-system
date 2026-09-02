import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Delivery } from '../lib/api'

export function DeliveryRow({
  delivery,
  index,
  disabled = false,
}: {
  delivery: Delivery
  index: number
  disabled?: boolean
}) {
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
          aria-label={`Reorder ${delivery.customerName}`}
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}
      <span className="drow__order">{index + 1}</span>
      <span className="drow__body">
        <span className="drow__name">{delivery.customerName}</span>
        <span className="drow__addr">{delivery.addressLine}</span>
      </span>
      <span className="status-badge" style={{ ['--c' as string]: delivery.statusColor }}>
        {delivery.statusName}
      </span>
    </li>
  )
}
