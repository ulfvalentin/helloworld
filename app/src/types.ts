export type GlutenStatus =
  | 'verified_gluten_free' // geprüft glutenfrei
  | 'unverified_gluten_free' // ungeprüft glutenfrei
  | 'may_contain_gluten' // kann Spuren von Gluten enthalten
  | 'contains_gluten' // enthält Gluten
  | 'no_gluten_detected' // keine Glutenzutaten erkannt, aber nicht eingestuft
  | 'unknown' // zu wenig Informationen

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
