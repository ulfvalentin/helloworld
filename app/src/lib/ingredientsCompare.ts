// Vergleich von Zutatenlisten verschiedener Quellen (Foto, Hersteller-Website, Open Food Facts, Datenbank).

const STOP = new Set(['und', 'aus', 'mit', 'von', 'in', 'ca', 'bio', 'and', 'of'])

/** Vergleichsschlüssel einer Zutat: ohne Klammern, Zahlen, Satzzeichen, Umlaute und Endungen. */
export function itemKey(item: string): string {
  return item
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 5 ? w.replace(/(en|er|n|e|s)+$/, '') : w))
    .join(' ')
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** Gleiche Zutat? Kleine Tippfehler der Texterkennung („Taplokamehl“) zählen als gleich. */
export function sameItem(a: string, b: string): boolean {
  const ka = itemKey(a)
  const kb = itemKey(b)
  if (!ka || !kb) return false
  if (ka === kb) return true
  const len = Math.max(ka.length, kb.length)
  return len >= 6 && distance(ka, kb) <= Math.floor(len / 6)
}

export interface ListComparison {
  /** Anteil gemeinsamer Zutaten an allen genannten, 0–1 */
  similarity: number
  onlyA: string[]
  onlyB: string[]
}

export function compareLists(a: string[], b: string[]): ListComparison {
  const usedB = new Set<number>()
  const onlyA: string[] = []
  let matched = 0
  for (const x of a) {
    const j = b.findIndex((y, i) => !usedB.has(i) && sameItem(x, y))
    if (j >= 0) {
      usedB.add(j)
      matched++
    } else onlyA.push(x)
  }
  const onlyB = b.filter((_, i) => !usedB.has(i))
  const union = a.length + b.length - matched
  return { similarity: union === 0 ? 1 : matched / union, onlyA, onlyB }
}
