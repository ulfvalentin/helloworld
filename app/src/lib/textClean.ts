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
// und typische Zeilen der Nährwerttabelle. Zubereitung und Lagerhinweise gehören nicht zu den Zutaten.
const STOP =
  /n[äa]hrw|durchsch|nutrition|brennw|kohlenhydrat|fetts[äa]ure|eiwei[ßs]|davon\b|zubereit|koch(?:en|t)\b|lager|trocken\b|lichtgesch|mindestens haltbar|haltbar|zu verbrauchen|aufbewahr|inhalt\b|hergestellt in|herkunft/i
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
    if (block.length > 0) {
      // Erstes Wort, ab dem der Text nicht mehr zur Zutatenliste gehört (z. B. „Trocken lagern“)
      let seen = ''
      let cut = -1
      line.words.forEach((w, i) => {
        if (cut >= 0 || !keepWord(w, LENIENT_WORD_CONFIDENCE)) return
        seen += `${seen ? ' ' : ''}${w.text}`
        if (STOP.test(seen)) cut = i
      })
      if (cut >= 0) {
        if (cut > 0) block.push({ words: line.words.slice(0, cut) })
        break
      }
    }
    block.push(line)
  }

  const words = block.flatMap((l) => l.words).filter((w) => !isSymbolOnly(w.text))
  if (words.length === 0) return null
  const quality = words.filter((w) => keepWord(w, MIN_WORD_CONFIDENCE)).length / words.length
  const trusted = quality >= TRUSTED_QUALITY

  // Möglichst vollständig: auch mittelsichere Wörter (ab 45 %) bleiben, nur Müll fliegt raus. Ob dem Ergebnis zu
  // trauen ist, sagen `quality` und `trusted`, nicht die Wortauswahl.
  const text = cleanLines(block, LENIENT_WORD_CONFIDENCE, 1)
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

// Alles ab einer dieser Überschriften ist keine Zutat mehr.
const SECTION_START =
  /(?<!\p{L})(zubereitung|lagerung|aufbewahrung|n[äa]hrwert\w*|brennwert|durchschnittliche|mindestens haltbar|nach dem [öo]ffnen|hergestellt (?:in|f[üu]r)|inhalt)(?!\p{L})\s*[:.]?/iu

// Einträge, die Kochanweisung, Lagerhinweis oder Verzehrempfehlung sind (keine Zutaten).
const INSTRUCTION =
  /(?<!\p{L})(zubereitung|zubereiten|kochen|gekocht|k[öo]cheln|garen|erhitzen|lagern|lagerung|aufbewahren|aufbewahrung|haltbar\w*|trocken|k[üu]hl|lichtgesch\w+|w[äa]rmegesch\w+|w[äa]rme-?|sch[üu]tteln|[öo]ffnen|abspülen|abgie(?:ß|ss)en|minuten|verbrauchen|gebrauch|hinweis\w*|n[äa]hrwert\w*|brennwert|portion\w*|verzehr\w*|empfehlung\w*)(?!\p{L})/iu

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
  // Zubereitung, Lagerung, Nährwerte … stehen nach der Zutatenliste und sind keine Zutaten
  const sectionAt = body.search(SECTION_START)
  const listPart = sectionAt >= 0 ? body.slice(0, sectionAt) : body
  const items: string[] = []
  let depth = 0
  let current = ''
  let rest: string | null = null
  for (let i = 0; i < listPart.length; i++) {
    const ch = listPart[i]
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    // Punkt + Leerzeichen außerhalb von Klammern beendet die Liste; Dezimalzahlen („2.5“) haben kein Leerzeichen
    if (ch === '.' && depth === 0 && /^\s+\S/.test(listPart.slice(i + 1))) {
      rest = listPart.slice(i + 1).trim()
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
      // Kochanweisungen, Lagerhinweise und ganze Sätze sind keine Zutaten
      .filter((i) => i.length > 0 && !INSTRUCTION.test(i) && i.replace(/\([^)]*\)/g, '').split(/\s+/).length <= 9),
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

const COMPANY =
  /((?:(?:[A-ZÄÖÜ][\p{L}.'-]*|&)\s+){1,5}(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|AG|KG|OHG|e\.\s?K\.|Ltd\.?|S\.\s?A\.?|B\.\s?V\.?|SE))(?![\p{L}])/u

/** Firmenname auf der Verpackung („Theodor Kattus GmbH“), meist beim Hersteller-/Inverkehrbringer-Hinweis. */
export function extractCompany(text: string): string | null {
  for (const line of text.split('\n')) {
    const m = COMPANY.exec(line)
    if (m) return m[1].replace(/\s+/g, ' ').trim()
  }
  return null
}
