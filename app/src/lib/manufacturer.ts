export interface ManufacturerResult {
  found: boolean
  sourceUrl: string | null
  title: string | null
  ingredients: string | null
  glutenStatements: string[]
  allergens: string | null
  /** false: Zutaten eines sehr ähnlichen Produkts */
  exact: boolean
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
