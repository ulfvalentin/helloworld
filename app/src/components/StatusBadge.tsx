import { STATUS_META } from '../lib/classify'
import type { GlutenStatus } from '../types'

export function StatusBadge({ status, large }: { status: GlutenStatus; large?: boolean }) {
  const meta = STATUS_META[status]
  return (
    <span className={`badge tone-${meta.tone}${large ? ' large' : ''}`}>
      {large ? meta.label : meta.short}
    </span>
  )
}
