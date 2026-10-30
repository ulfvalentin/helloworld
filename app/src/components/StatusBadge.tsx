import { STATUS_META } from '../lib/classify'
import type { GlutenStatus } from '../types'

/** Kleine Markierung für die Produktliste. Das große Ergebnis zeigt Verdict. */
export function StatusBadge({ status }: { status: GlutenStatus }) {
  const meta = STATUS_META[status]
  return <span className={`badge tone-${meta.tone}`}>{meta.short}</span>
}
