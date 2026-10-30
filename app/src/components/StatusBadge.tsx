import { STATUS_META } from '../lib/classify'
import type { GlutenStatus } from '../types'
import { STATUS_ICON } from './statusIcons'

/** Status-Chip (Symbol + Wort, nie nur Farbe) für Listen. Das große Ergebnis zeigt Verdict. */
export function StatusBadge({ status }: { status: GlutenStatus }) {
  const meta = STATUS_META[status]
  const Icon = STATUS_ICON[status]
  return (
    <span className={`chip-status tone-${meta.tone}`}>
      <Icon size={16} /> {meta.short}
    </span>
  )
}
