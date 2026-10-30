import type { ProductInput } from '../types'

export interface ManufacturerResult {
  found: boolean
  sourceUrl: string | null
  title: string | null
  ingredients: string | null
  glutenStatements: string[]
  allergens: string | null
  message: string
}

export interface ManufacturerQuery {
  name?: string | null
  brand?: string | null
  barcode?: string | null
  urls?: string[]
  hints?: string[]
}

/**
 * Fragt die Server-Funktion /api/product-info, die die Hersteller-Website besucht.
 * `null`, wenn die Funktion nicht erreichbar ist (z. B. lokal ohne Vercel).
 */
export async function lookupManufacturer(q: ManufacturerQuery): Promise<ManufacturerResult | null> {
  const params = new URLSearchParams()
  if (q.name) params.set('name', q.name)
  if (q.brand) params.set('brand', q.brand)
  if (q.barcode) params.set('barcode', q.barcode)
  for (const u of q.urls ?? []) params.append('url', u)
  for (const h of q.hints ?? []) params.append('hint', h)
  try {
    const res = await fetch(`/api/product-info?${params}`, { signal: AbortSignal.timeout(20000) })
    if (!res.ok || !/json/.test(res.headers.get('content-type') ?? '')) return null
    return (await res.json()) as ManufacturerResult
  } catch {
    return null
  }
}

const MARK = 'Hersteller-Website:'

/** Übernimmt Zutaten und Gluten-Aussagen der Hersteller-Seite in die Produktangaben. */
export function applyManufacturer(input: ProductInput, result: ManufacturerResult): ProductInput {
  if (!result.found || !result.ingredients) return input
  const kept = (input.label_text ?? '')
    .split('\n')
    .filter((line) => !line.startsWith(MARK))
    .join('\n')
    .trim()
  const statements = result.glutenStatements.map((s) => `${MARK} ${s}`)
  return {
    ...input,
    ingredients_text: result.ingredients,
    label_text: [kept, ...statements].filter(Boolean).join('\n') || null,
  }
}
