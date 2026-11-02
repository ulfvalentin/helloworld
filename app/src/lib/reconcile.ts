import type { CheckNote, Reconciliation, SourceList } from '../types'
import { findGlutenSources, normalizeText } from './classify'
import { compareLists } from './ingredientsCompare'
import { SOURCE_NAME } from './sources'

/**
 * Welche Liste wird angezeigt? Ein gut lesbares Foto zeigt die aktuelle Packung und gewinnt (Rezepturen ändern sich),
 * dann die Hersteller-Website (nachweislich dasselbe Produkt), Open Food Facts, die eigene Datenbank. Ein
 * unsicher gelesenes Foto ist nur die letzte Notlösung.
 */
function priority(l: SourceList): number {
  switch (l.source) {
    case 'foto':
      return l.quality === 'gut' ? 4 : 1
    case 'hersteller':
      return l.exact === false ? 2.2 : 3.5
    case 'openfoodfacts':
      return 3
    case 'datenbank':
      return 2.5
  }
}

const preview = (items: string[]) => (items.length > 5 ? `${items.slice(0, 5).join(', ')} …` : items.join(', '))

const glutenOf = (items: string[]) => new Set(findGlutenSources(normalizeText(items.join(', '))))

export interface ReconcileResult {
  chosen: SourceList | null
  reconciliation: Reconciliation
  notes: CheckNote[]
}

/** Gleicht die Zutatenlisten der Quellen ab, wählt die anzuzeigende und meldet Unterschiede als Hinweise. */
export function reconcile(lists: SourceList[]): ReconcileResult {
  const usable = lists.filter((l) => l.items.length > 0)
  if (usable.length === 0)
    return { chosen: null, reconciliation: { status: 'none', summary: 'Keine Zutaten gefunden.' }, notes: [] }

  const chosen = [...usable].sort((a, b) => priority(b) - priority(a))[0]
  const notes: CheckNote[] = []
  let differs = false
  let compared = 0

  for (const other of usable) {
    if (other === chosen) continue
    if (other.source === 'foto' && other.quality === 'unsicher') {
      notes.push({ level: 'info', text: 'Das Foto war schwer lesbar und wurde nicht zum Vergleich herangezogen.' })
      continue
    }
    compared++
    const cmp = compareLists(chosen.items, other.items)
    const name = SOURCE_NAME[other.source]
    if (cmp.onlyA.length > 0 || cmp.onlyB.length > 0) {
      differs = true
      const parts = []
      if (cmp.onlyB.length) parts.push(`nennt zusätzlich: ${preview(cmp.onlyB)}`)
      if (cmp.onlyA.length) parts.push(`nennt nicht: ${preview(cmp.onlyA)}`)
      notes.push({ level: 'info', text: `${name} weicht ab – ${parts.join('; ')}.` })
    }
    // Bei Gluten genau hinsehen: Nennt eine Quelle Gluten-Getreide, das in der angezeigten Liste fehlt?
    const mine = glutenOf(chosen.items)
    const theirs = glutenOf(other.items)
    const onlyTheirs = [...theirs].filter((g) => !mine.has(g))
    const onlyMine = [...mine].filter((g) => !theirs.has(g))
    if (onlyTheirs.length)
      notes.push({ level: 'warn', text: `Achtung: ${name} nennt ${onlyTheirs.join(', ')}, die angezeigte Liste (${SOURCE_NAME[chosen.source]}) nicht.` })
    if (onlyMine.length)
      notes.push({ level: 'warn', text: `Achtung: ${name} nennt ${onlyMine.join(', ')} nicht, die angezeigte Liste (${SOURCE_NAME[chosen.source]}) schon.` })
    if (other.exact === false)
      notes.push({ level: 'info', text: `${name}: nicht eindeutig dasselbe Produkt – bitte mit der Packung vergleichen.` })
  }
  notes.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1))

  const names = usable.map((l) => SOURCE_NAME[l.source])
  let reconciliation: Reconciliation
  if (compared === 0)
    reconciliation = { status: 'single', summary: `Nur eine Quelle hat Zutaten (${SOURCE_NAME[chosen.source]}) – nichts zum Vergleichen.` }
  else if (!differs)
    reconciliation = { status: 'consistent', summary: `Alle ${compared + 1} Quellen mit Zutaten stimmen überein (${names.join(', ')}).` }
  else
    reconciliation = { status: 'differs', summary: `Die Quellen weichen voneinander ab (siehe Hinweise). Angezeigt wird: ${SOURCE_NAME[chosen.source]}.` }
  return { chosen, reconciliation, notes }
}
