import type { Product } from '../types'
import { CONFIRMATION_VALID_MONTHS } from './classify'

export interface InfoAge {
  /** ISO-Datum (YYYY-MM-DD), an dem die Angaben eingetragen wurden */
  date: string
  /** Älter als 6 Monate: die Angaben sollten aktualisiert werden */
  stale: boolean
}

/** Alter der Produktangaben. Ältere Einträge ohne `info_updated_at` zählen ab `updated_at`. */
export function infoAge(p: Pick<Product, 'info_updated_at' | 'updated_at'>, now = new Date()): InfoAge {
  const date = (p.info_updated_at ?? p.updated_at).slice(0, 10)
  const limit = new Date(date + 'T00:00:00Z')
  limit.setUTCMonth(limit.getUTCMonth() + CONFIRMATION_VALID_MONTHS)
  return { date, stale: limit.getTime() < now.getTime() }
}

/** „12.10.2026“ aus „2026-10-12“. */
export const formatDate = (iso: string) => iso.split('-').reverse().join('.')
