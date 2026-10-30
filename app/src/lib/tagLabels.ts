// Lesbare Namen für Open-Food-Facts-Tags („en:soybeans“ → „Soja“).

const GERMAN: Record<string, string> = {
  gluten: 'Gluten',
  milk: 'Milch',
  eggs: 'Ei',
  soybeans: 'Soja',
  nuts: 'Schalenfrüchte',
  peanuts: 'Erdnüsse',
  celery: 'Sellerie',
  mustard: 'Senf',
  'sesame-seeds': 'Sesam',
  fish: 'Fisch',
  crustaceans: 'Krebstiere',
  molluscs: 'Weichtiere',
  lupin: 'Lupine',
  'sulphur-dioxide-and-sulphites': 'Sulfite',
}

/** Namen aller Tags mit dem Präfix, z. B. tagNames(['allergens:en:gluten'], 'allergens') → ['Gluten']. */
export function tagNames(tags: string[], prefix: string): string[] {
  return tags
    .filter((t) => t.startsWith(`${prefix}:`))
    .map((t) => t.slice(prefix.length + 1).replace(/^[a-z]{2}:/, ''))
    .map((n) => GERMAN[n] ?? n.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()))
}
