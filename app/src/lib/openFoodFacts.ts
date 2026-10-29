export interface ExternalProduct {
  source: 'openfoodfacts'
  barcode: string
  name: string | null
  brand: string | null
  ingredientsText: string | null
  imageUrl: string | null
  /** Mit Präfix: "labels:en:gluten-free", "allergens:en:gluten", "traces:en:gluten" */
  tags: string[]
}

const FIELDS = [
  'product_name_de',
  'product_name',
  'brands',
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
    name: p.product_name_de || p.product_name || null,
    brand: p.brands || null,
    ingredientsText: p.ingredients_text_de || p.ingredients_text || null,
    imageUrl: p.image_front_small_url || null,
    tags: [
      ...prefixed('labels', p.labels_tags),
      ...prefixed('allergens', p.allergens_tags),
      ...prefixed('traces', p.traces_tags),
    ],
  }
}
