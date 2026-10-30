// Aufräumen des per Texterkennung gelesenen Verpackungstexts: unsichere Wörter und
// Symbolmüll entfernen, Zutatenliste herausschneiden, in einzelne Zutaten zerlegen.

export interface OcrWord {
  text: string
  /** Sicherheit der Erkennung, 0–100 */
  confidence: number
}
export interface OcrLine {
  words: OcrWord[]
}

/** Ab dieser Sicherheit gilt ein Wort als sicher gelesen. */
export const MIN_WORD_CONFIDENCE = 70
/** Untergrenze, um das Ende des Zutatenblocks (Nährwerttabelle …) auch in unsicheren Zeilen zu erkennen. */
export const LENIENT_WORD_CONFIDENCE = 45
/** Anteil sicher gelesener Wörter im Zutatenblock, ab dem dem Foto vertraut wird. */
export const TRUSTED_QUALITY = 0.9

const HEADING = /\b(zutaten|ingredients|ingr[ée]dients)\b/i
// Ende der Zutatenliste. Die Erkennung verschreibt sich oft („Durchschaittliche“), deshalb auch Wortanfänge
// und typische Zeilen der Nährwerttabelle.
const STOP =
  /n[äa]hrw|durchsch|nutrition|brennw|kohlenhydrat|fetts[äa]ure|eiwei[ßs]|davon\b|mindestens haltbar|zu verbrauchen|aufbewahrung|inhalt\b|hergestellt in|herkunft/i
const MAX_BLOCK_LINES = 8

const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length
const isSymbolOnly = (s: string) => !/[\p{L}\p{N}]/u.test(s)

function keepWord(w: OcrWord, minConfidence: number): boolean {
  if (isSymbolOnly(w.text) || w.confidence < minConfidence) return false
  // Einzelne Buchstaben sind fast immer Erkennungsmüll ("A", "E", "X") – außer sehr sicher gelesen.
  if (letters(w.text) === 1 && !/\d/.test(w.text) && w.confidence < 90) return false
  return true
}

/** Entfernt Symbolmüll (`|`, `\`, `©` …), die Wörter selbst bleiben unverändert. */
function stripSymbols(text: string): string {
  return text
    .replace(/[|\\©®™_~=¦•§]+/g, ' ')
    .replace(/[‘’“”„"']+(?=\p{L})/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Zeilen nur mit Wörtern ab `minConfidence`. Zeilen mit weniger als `minWords` Wörtern entfallen –
 * im übrigen Verpackungstext sind einzelne Wörter meist Müll, in der Zutatenliste nicht.
 */
export function cleanLines(lines: OcrLine[], minConfidence = MIN_WORD_CONFIDENCE, minWords = 2): string[] {
  const out: string[] = []
  for (const line of lines) {
    const text = stripSymbols(
      line.words
        .filter((w) => keepWord(w, minConfidence))
        .map((w) => w.text)
        .join(' '),
    )
    if (text.split(' ').filter(Boolean).length >= minWords || HEADING.test(text)) out.push(text)
  }
  return out
}

/** Gesamttext fürs Speichern: alle Wörter, nur ohne Symbolmüll und einzelne Störzeichen. */
export function tidyRawText(lines: OcrLine[]): string {
  return lines
    .map((l) => stripSymbols(l.words.filter((w) => !isSymbolOnly(w.text)).map((w) => w.text).join(' ')))
    .filter((t) => t.length > 0)
    .join('\n')
}

export interface IngredientBlock {
  /** Zutatentext aus den sicher gelesenen Wörtern (bei `trusted: false` unvollständig) */
  text: string
  /** Anteil sicher gelesener Wörter im Block, 0–1 */
  quality: number
  trusted: boolean
  /** Sicher gelesene, markante Wörter (Zutatenwörter) – zum Wiedererkennen des Produkts im Netz */
  hints: string[]
}

/** Schneidet den Zutatenblock aus dem Foto heraus und bewertet, wie gut er lesbar war. */
export function extractIngredientBlock(lines: OcrLine[]): IngredientBlock | null {
  const start = lines.findIndex((l) => HEADING.test(l.words.map((w) => w.text).join(' ')))
  if (start < 0) return null

  const block: OcrLine[] = []
  for (const line of lines.slice(start, start + MAX_BLOCK_LINES)) {
    const lenient = stripSymbols(
      line.words
        .filter((w) => keepWord(w, LENIENT_WORD_CONFIDENCE))
        .map((w) => w.text)
        .join(' '),
    )
    if (block.length > 0 && STOP.test(lenient)) break
    block.push(line)
  }

  const words = block.flatMap((l) => l.words).filter((w) => !isSymbolOnly(w.text))
  if (words.length === 0) return null
  const quality = words.filter((w) => keepWord(w, MIN_WORD_CONFIDENCE)).length / words.length
  const trusted = quality >= TRUSTED_QUALITY

  // Auch bei schlecht lesbarem Foto nur sichere Wörter zeigen – unsichere ergeben Buchstabensalat
  const text = cleanLines(block, MIN_WORD_CONFIDENCE, 1)
    .join(' ')
    .replace(/(\p{L})- (\p{Ll})/gu, '$1$2') // Silbentrennung am Zeilenende
    .replace(/^\s*(zutaten|ingredients)\s*[:.]?\s*/i, '')
    .trim()
  const hints = [
    ...new Set(
      words
        .filter((w) => w.confidence >= 80)
        .map((w) => w.text.replace(/[^\p{L}]/gu, ''))
        .filter((w) => w.length >= 5 && !HEADING.test(w)),
    ),
  ].slice(0, 10)
  return text ? { text, quality, trusted, hints } : null
}

const TRACE =
  /(?:kann|k[öo]nnen|k[öo]nnte)[^.]{0,40}?spuren[^.]*\.?|spuren\s+von[^.]*\.?|may contain[^.]*\.?|(?:in einem|im selben|im gleichen) betrieb[^.]*\.?/gi

export interface ParsedIngredients {
  items: string[]
  /** Spurenhinweise wie „Kann Spuren von Sellerie enthalten.“ */
  traces: string[]
  /** Text hinter dem Ende der Zutatenliste, z. B. Fußnoten („1 Rainforest Alliance-zertifiziert“) */
  rest: string | null
}

/** Zerlegt „Wasser, Hafer 10 %, Säureregulator (E340)“ in einzelne Zutaten. */
export function parseIngredients(text: string): ParsedIngredients {
  const traces = [...text.matchAll(TRACE)].map((m) => m[0].trim())
  const body = text
    .replace(TRACE, ' ')
    .replace(/^\s*(zutaten|ingredients)\s*[:.]?\s*/i, '')
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2')
    .replace(/\s+/g, ' ')
  const items: string[] = []
  let depth = 0
  let current = ''
  let rest: string | null = null
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    // Punkt + Leerzeichen außerhalb von Klammern beendet die Liste; Dezimalzahlen („2.5“) haben kein Leerzeichen
    if (ch === '.' && depth === 0 && /^\s+\S/.test(body.slice(i + 1))) {
      rest = body.slice(i + 1).trim()
      break
    }
    if ((ch === ',' || ch === ';') && depth === 0) {
      items.push(current)
      current = ''
    } else current += ch
  }
  items.push(current)
  return {
    items: items
      .map((i) =>
        i
          .trim()
          .replace(/^[.:\s]+|[.\s]+$/g, '')
          // hochgestellte Fußnotenziffern kleben am Wort („Kakaopulver1“); „B12“ bleibt unberührt
          .replace(/(\p{L}{5,})\d{1,2}(?=[\s)]|$)/gu, '$1'),
      )
      .filter((i) => i.length > 0),
    traces,
    rest: rest || null,
  }
}

// Seiten, die auf Packungen stehen, aber keine Produktinformationen des Herstellers enthalten.
const NOT_MANUFACTURER =
  /(^|\.)(ra\.org|rainforest-alliance\.org|gruener-punkt\.de|fsc\.org|msc\.org|fairtrade\.\w+|utz\.org|blauer-engel\.de|nutri-score\.\w+|recycling\w*\.\w+)$/

/** Webadressen, die auf der Verpackung stehen („www.bamboogarden.de“). */
export function extractWebsites(text: string): string[] {
  const out: string[] = []
  const re = /(?<![@\w./-])(?:https?:\/\/)?(www\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,10})(\/[^\s"'<>)]*)?/gi
  for (const m of text.matchAll(re)) {
    const host = m[1].toLowerCase()
    if (NOT_MANUFACTURER.test(host.replace(/^www\./, ''))) continue
    const url = `https://${host}${(m[2] ?? '').replace(/[.,;:]+$/, '')}`
    if (!out.includes(url)) out.push(url)
  }
  return out
}
