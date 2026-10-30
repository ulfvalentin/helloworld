import type { CheckContext } from './lib/runCheck'

export type GlutenStatus =
  // Die Schlüssel entsprechen den Werten der Datenbank (enum gluten_status) und bleiben bewusst
  // stabil; die sichtbaren Namen stehen in STATUS_META (classify.ts).
  | 'verified_gluten_free' // „Sicher glutenfrei lt. Hersteller“: Logo oder Herstellerbestätigung ≤ 6 Monate
  | 'unverified_gluten_free' // „Keine glutenhaltigen Zutaten“: Zutaten ohne Gluten, Kreuzkontamination offen
  | 'may_contain_gluten' // kann Spuren von Gluten enthalten
  | 'contains_gluten' // enthält Gluten
  | 'unknown' // zu wenig oder unsichere Informationen

export interface ManufacturerConfirmation {
  id: string
  product_id: string
  /** ISO-Datum (YYYY-MM-DD) der Herstellerantwort */
  confirmed_at: string
  confirms_gluten_free: boolean
  contact: string | null
  note: string | null
  created_at: string
}

export interface Product {
  id: string
  barcode: string | null
  name: string | null
  brand: string | null
  ingredients_text: string | null
  label_text: string | null
  /** Zertifizierungslogo (z. B. durchgestrichene Ähre / AOECS) auf der Verpackung */
  certified_label: boolean
  certification_note: string | null
  /** Tags aus Open Food Facts (labels, allergens, traces) */
  external_tags: string[]
  image_url: string | null
  status: GlutenStatus
  status_reasons: string[]
  created_at: string
  updated_at: string
  confirmations: ManufacturerConfirmation[]
}

export type ProductInput = Omit<
  Product,
  'id' | 'created_at' | 'updated_at' | 'confirmations' | 'status' | 'status_reasons'
>

export type ConfirmationInput = Omit<ManufacturerConfirmation, 'id' | 'product_id' | 'created_at'>

/** Die vier Quellen jeder Prüfung. */
export type IngredientSource = 'foto' | 'datenbank' | 'openfoodfacts' | 'hersteller'
export type SourceId = IngredientSource

/** Woher stammt die Zutatenliste, und wie verlässlich ist sie? */
export interface IngredientInfo {
  source: IngredientSource | null
  trusted: boolean
  /** Seite des Herstellers, falls von dort */
  url: string | null
  /** false: Zutaten stammen von einem sehr ähnlichen, nicht exakt demselben Produkt */
  exact?: boolean
  /** Ergebnis der automatischen Suche auf der Hersteller-Website */
  lookup: 'found' | 'not-found' | 'unavailable' | 'skipped'
  message: string | null
}

/** Eine Zutatenliste aus einer der Quellen. */
export interface SourceList {
  source: SourceId
  text: string
  items: string[]
  /** Foto: „unsicher“, wenn viele Wörter schlecht lesbar waren */
  quality: 'gut' | 'unsicher'
  url?: string | null
  /** Hersteller-Website: false, wenn nicht nachweislich dasselbe Produkt */
  exact?: boolean
}

/** Was eine Quelle bei der Prüfung ergeben hat. */
export interface StepReport {
  source: SourceId
  status: 'found' | 'none' | 'error' | 'skipped'
  summary: string
  url?: string | null
}

export interface CheckNote {
  level: 'warn' | 'info'
  text: string
}

/** Wer/was ist das Produkt – mit der Quelle jeder Angabe. */
export interface Identity {
  name: string | null
  brand: string | null
  /** Firma laut Verpackung/Open Food Facts („Theodor Kattus GmbH“) */
  company: string | null
  barcode: string | null
  from: { name?: string; brand?: string; company?: string; barcode?: string }
}

export interface Reconciliation {
  status: 'consistent' | 'differs' | 'single' | 'none'
  summary: string
}

/** Ergebnis der Prüfung über alle Quellen. */
export interface CheckReport {
  identity: Identity
  steps: StepReport[]
  lists: SourceList[]
  chosen: SourceId | null
  reconciliation: Reconciliation
  notes: CheckNote[]
}

/** Ergebnis der Analyse, bevor es gespeichert wird. */
export interface Draft {
  input: ProductInput
  existing: Product | null
  /** Erkannter Text der Fotos (aufgeräumt), für die Scan-Historie */
  ocrText: string | null
  sources: string[]
  ingredients: IngredientInfo
  /** Webadressen von der Verpackung */
  websites: string[]
  /** Sicher gelesene Zutatenwörter, um das Produkt im Netz wiederzuerkennen */
  hints: string[]
  check: CheckReport
  /** Gesammelte Rohdaten der Prüfung: Daraus lässt sich der Abgleich neu berechnen (z. B. nach „Hersteller-Website prüfen“) */
  context: CheckContext
}
