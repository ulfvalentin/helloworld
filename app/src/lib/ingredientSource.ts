import type { IngredientSource } from '../types'
import type { IngredientBlock } from './textClean'

export interface IngredientChoice {
  text: string | null
  source: IngredientSource | null
  /** Verlässlich genug, um darauf eine Einstufung zu stützen */
  trusted: boolean
}

/**
 * Welcher Zutatenliste wird vertraut? Ein gut lesbares aktuelles Foto gewinnt (Rezepturen ändern sich),
 * dann der gespeicherte Eintrag, dann Open Food Facts. Ein schlecht gelesenes Foto ist nur die letzte
 * Notlösung – dann sucht die App auf der Hersteller-Website.
 */
export function chooseIngredients(o: {
  block: IngredientBlock | null
  existing: string | null
  external: string | null
}): IngredientChoice {
  if (o.block?.trusted) return { text: o.block.text, source: 'foto', trusted: true }
  if (o.existing) return { text: o.existing, source: 'datenbank', trusted: true }
  if (o.external) return { text: o.external, source: 'openfoodfacts', trusted: true }
  // Ein schlecht gelesener Block mischt oft Text der Nachbarspalte hinein – dann lieber keine Zutaten
  // anzeigen als falsche (der Rohtext wird trotzdem auf Gluten durchsucht).
  if (o.block) return { text: o.block.quality >= 0.6 ? o.block.text : null, source: 'foto', trusted: false }
  return { text: null, source: null, trusted: false }
}
