import type { SourceId, SourceList } from '../types'
import { SOURCE_NAME } from './sources'

/** Zeilen dieser Form führen die Zutaten einer weiteren Quelle (Hersteller-Website, Open Food Facts). */
export const SOURCE_LINE = /^Quelle ([^:\n]+):\s*(.+)$/

/**
 * Text, der mit dem Produkt gespeichert und auf Gluten durchsucht wird: der erkannte Text vom Foto, die Zutaten
 * der übrigen externen Quellen („Quelle Open Food Facts: …“) und Gluten-Aussagen der Hersteller-Website.
 * Nennt irgendeine Quelle Gluten-Zutaten, zählt das – bei Zöliakie ist ein Fehlalarm besser als ein übersehenes Gluten.
 */
export function buildLabelText(o: {
  ocrText: string | null
  lists: SourceList[]
  chosen: SourceId | null
  statements: string[]
}): string | null {
  const parts: string[] = []
  if (o.ocrText) parts.push(o.ocrText)
  for (const l of o.lists) {
    // Die eigene Datenbank gehört nicht dazu: Sie enthält alte Stände und würde eine geänderte Rezeptur dauerhaft belasten.
    if (l.source === 'foto' || l.source === 'datenbank' || l.source === o.chosen || l.items.length === 0) continue
    parts.push(`Quelle ${SOURCE_NAME[l.source]}: ${l.text.replace(/\s+/g, ' ').trim()}`)
  }
  for (const s of o.statements) parts.push(`Hersteller-Website: ${s}`)
  return parts.join('\n') || null
}

/** Trennt die Quellen-Zeilen vom restlichen Text. */
export function splitSourceLines(labelText: string | null | undefined): {
  sources: { name: string; text: string }[]
  rest: string
} {
  const sources: { name: string; text: string }[] = []
  const rest: string[] = []
  for (const line of (labelText ?? '').split('\n')) {
    const m = SOURCE_LINE.exec(line.trim())
    if (m) sources.push({ name: m[1].trim(), text: m[2] })
    else rest.push(line)
  }
  return { sources, rest: rest.join('\n') }
}
