export interface ExternalProduct {
  source: 'openfoodfacts'
  barcode: string
  name: string | null
  brand: string | null
  /** Firma hinter der Marke, falls bekannt */
  company: string | null
  ingredientsText: string | null
  imageUrl: string | null
  /** Produktseite des Herstellers, falls in Open Food Facts hinterlegt */
  link: string | null
  /** Mit Präfix: "labels:en:gluten-free", "allergens:en:gluten", "traces:en:gluten" */
  tags: string[]
}

const FIELDS = [
  'product_name_de',
  'product_name',
  'generic_name_de',
  'generic_name',
  'link',
  'brands',
  'brand_owner',
  'ingredients_text_de',
  'ingredients_text',
  'labels_tags',
  'allergens_tags',
  'traces_tags',
  'image_front_small_url',
].join(',')

/** Sucht ein Produkt per Barcode in Open Food Facts (offene, frei nutzbare Datenbank). */
export async function lookupOpenFoodFacts(barcode: string): Promise<ExternalProduct | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
  )
  if (!res.ok) return null
  const json = await res.json()
  if (json.status !== 1 || !json.product) return null
  const p = json.product
  const prefixed = (prefix: string, tags: unknown) =>
    Array.isArray(tags) ? tags.map((t) => `${prefix}:${t}`) : []
  return {
    source: 'openfoodfacts',
    barcode,
    name: p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || null,
    brand: p.brands || null,
    company: p.brand_owner || null,
    // Open Food Facts hebt Allergene mit _Unterstrichen_ hervor
    ingredientsText: (p.ingredients_text_de || p.ingredients_text || '').replace(/_/g, '').trim() || null,
    imageUrl: p.image_front_small_url || null,
    link: typeof p.link === 'string' && /^https?:\/\//.test(p.link) ? p.link : null,
    tags: [
      ...prefixed('labels', p.labels_tags),
      ...prefixed('allergens', p.allergens_tags),
      ...prefixed('traces', p.traces_tags),
    ],
  }
}
