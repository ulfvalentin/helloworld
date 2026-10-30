import type { GlutenStatus } from '../types'
import { CheckIcon, CircleHelpIcon, ShieldCheckIcon, TriangleAlertIcon, XIcon } from './icons'

/** Symbol je Einstufung: ✓ sicher · ! Spuren/unbekannt · ✕ Gluten (Status nie nur über Farbe). */
export const STATUS_ICON: Record<GlutenStatus, typeof CheckIcon> = {
  verified_gluten_free: ShieldCheckIcon,
  unverified_gluten_free: CheckIcon,
  may_contain_gluten: TriangleAlertIcon,
  contains_gluten: XIcon,
  unknown: CircleHelpIcon,
}
