import type { GlutenStatus } from '../types'

/** Herstellerbestätigungen gelten so viele Monate. */
export const CONFIRMATION_VALID_MONTHS = 6

export interface ClassificationInput {
  /** Zutatenliste (aus OCR oder Datenbank) */
  ingredientsText?: string | null
  /** Restlicher Verpackungstext (Vorderseite, Hinweise, Logos als Text) */
  labelText?: string | null
  /** Zertifizierungslogo wurde (manuell oder per Tag) erkannt */
  certifiedLabel?: boolean
  /**
   * Tags aus externen Datenbanken mit Präfix, z. B. aus Open Food Facts:
   * "labels:en:gluten-free", "allergens:en:gluten", "traces:en:gluten"
   */
  externalTags?: string[]
  confirmations?: { confirmed_at: string; confirms_gluten_free: boolean }[]
  /**
   * false: Die Zutatenliste wurde unsicher gelesen. „Keine glutenhaltigen Zutaten“ ist dann nicht
   * belastbar und wird zu „Unbekannt“. Gefundene Gluten-Wörter und Spurenhinweise zählen weiterhin.
   */
  ingredientsReliable?: boolean
  now?: Date
}

/** Ein gefundenes Gluten-Wort, so wie es im Text steht („Weizenmehl“), samt Getreide („Weizen“). */
export interface GlutenFinding {
  word: string
  cereal: string
  /** Wo es steht: Zutatenliste, restlicher Verpackungstext oder externe Datenbank */
  where: 'zutaten' | 'verpackung' | 'datenbank'
}

/** Ein Schritt der Begründung, ggf. mit den gefundenen Wörtern. */
export interface ExplanationItem {
  text: string
  words?: { word: string; cereal: string }[]
}

export interface Classification {
  status: GlutenStatus
  /** Begründung als Text (wird mit der Einstufung gespeichert) */
  reasons: string[]
  /** Dieselbe Begründung strukturiert, mit den gefundenen Wörtern zum Hervorheben */
  explanation: ExplanationItem[]
  glutenFindings: GlutenFinding[]
  glutenSources: string[]
  traces: string[]
  /** Bis wann die jüngste positive Herstellerbestätigung gilt (ISO-Datum) */
  confirmationValidUntil: string | null
}

// Glutenhaltige Getreide und Erzeugnisse (EU-LMIV Anhang II Nr. 1), deutsch + englisch.
// Deutsche Komposita ("Vollkornweizenmehl") verbieten Wortgrenzen, deshalb Lookbehinds
// nur dort, wo es gluten­freie Verwechslungen gibt (Buchweizen).
const GLUTEN_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Weizen', re: /(?<!buch)weizen/g },
  { label: 'Roggen', re: /roggen/g },
  { label: 'Gerste', re: /gerste/g },
  { label: 'Hafer', re: /hafer/g },
  { label: 'Dinkel', re: /dinkel/g },
  { label: 'Grünkern', re: /gr(ü|ue)nkern/g },
  { label: 'Kamut/Khorasan', re: /kamut|khorasan/g },
  { label: 'Emmer', re: /(?<![a-zäöüß])emmer/g },
  { label: 'Einkorn', re: /einkorn/g },
  { label: 'Triticale', re: /triticale/g },
  { label: 'Malz', re: /malz/g },
  { label: 'Bulgur', re: /bulgur/g },
  { label: 'Couscous', re: /couscous|kuskus/g },
  { label: 'Seitan', re: /seitan/g },
  { label: 'Paniermehl', re: /paniermehl|semmelbr(ö|oe)sel/g },
  { label: 'Gluten', re: /gluten(?![\s-]*(frei|free))/g },
  { label: 'Weizen (wheat)', re: /(?<!buck)wheat/g },
  { label: 'Roggen (rye)', re: /\brye\b/g },
  { label: 'Gerste (barley)', re: /barley/g },
  { label: 'Hafer (oats)', re: /\boats?\b/g },
  { label: 'Dinkel (spelt)', re: /\bspelt\b/g },
  { label: 'Malz (malt)', re: /\bmalt\b/g },
]

// Erzeugnisse aus Glutengetreide, die laut LMIV ausdrücklich nicht als glutenhaltig gelten.
const EXEMPT_CONTEXT = /gluk?cose?sirup|glukose|glucose|maltodextrin|dextrose|destillat|alkohol|ethanol|getreidebrand/

// Negationen direkt vor dem Treffer ("ohne Weizen", "frei von Gluten").
const NEGATION_BEFORE = /(ohne|frei von|free from|no|kein|keine|keinen)\s*$/

const GLUTEN_FREE_CLAIM = /gluten[\s-]*frei|gluten[\s-]*free|ohne gluten|sans gluten|senza glutine/

// Hinweise auf Zertifizierung, die sich als Text auf der Packung finden.
// AOECS-Lizenznummer der durchgestrichenen Ähre: z. B. "DE-020-012", "AT-123-001".
const CERTIFICATION_TEXT =
  /crossed grain|durchgestrichene [äa]hre|aoecs|dzg|zertifiziert glutenfrei|certified gluten[\s-]*free|\b[a-z]{2}-\d{3}-\d{3}\b/

// Spuren- und Kreuzkontaminationshinweise. Gruppe 1 enthält jeweils den relevanten Inhalt.
const TRACE_PATTERNS: RegExp[] = [
  /(?:(?:kann|k[öo]nnen|k[öo]nnte|enth[äa]lt m[öo]glicherweise)\s+(?:\S+\s+){0,2}?)?spuren(?: von)?([^.]*?)(?:enthalten|\.|n[äa]hrwert|$)/g,
  /may contain(?: traces of)?([^.]*?)(?:\.|$)/g,
  /((?:in einem|im selben|im gleichen) betrieb[^.]*?verarbeitet|auf (?:anlagen|einer anlage)[^.]*?(?:verarbeitet|hergestellt))/g,
]

export function normalizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2') // Silbentrennung am Zeilenende
    .replace(/[\s ]+/g, ' ')
    .trim()
}

/** Die einzelne Zutat (zwischen Kommas/Semikolons) an Position `pos`. */
function ingredientAt(text: string, pos: number): string {
  const start = Math.max(text.lastIndexOf(',', pos), text.lastIndexOf(';', pos)) + 1
  const ends = [text.indexOf(',', pos), text.indexOf(';', pos)].filter((i) => i >= 0)
  return text.slice(start, ends.length ? Math.min(...ends) : text.length)
}

export interface GlutenMatch {
  /** Wort wie im Text, erster Buchstabe groß: „Vollkornweizenmehl“ */
  word: string
  /** Getreide: „Weizen“ */
  cereal: string
}

/** Das ganze Wort um einen Treffer herum („vollkornweizenmehl“ statt nur „weizen“). */
function wordAround(text: string, start: number, end: number): string {
  let s = start
  let e = end
  while (s > 0 && /\p{L}/u.test(text[s - 1])) s--
  while (e < text.length && /\p{L}/u.test(text[e])) e++
  const word = text.slice(s, e)
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Findet glutenhaltige Wörter in einem (normalisierten) Text, mit dem Wort, wie es dort steht. */
export function findGlutenMatches(text: string): GlutenMatch[] {
  const byWord = new Map<string, GlutenMatch>()
  for (const { label, re } of GLUTEN_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      const before = text.slice(Math.max(0, start - 25), start)
      if (NEGATION_BEFORE.test(before)) continue
      if (EXEMPT_CONTEXT.test(ingredientAt(text, start))) continue
      // "glutenfreier Hafer", "Weizenstärke (glutenfrei)"
      if (/gluten[\s-]*frei[\wäöüß]*\s*$/.test(before)) continue
      if (/^[\wäöüß]*\s*\(?\s*gluten[\s-]*frei/.test(text.slice(start + m[0].length, start + m[0].length + 20)))
        continue
      const word = wordAround(text, start, start + m[0].length)
      const known = byWord.get(word.toLowerCase())
      if (!known) byWord.set(word.toLowerCase(), { word, cereal: label })
      else if (!known.cereal.split(', ').includes(label)) known.cereal += `, ${label}`
    }
  }
  return [...byWord.values()]
}

/** Findet glutenhaltige Zutaten in einem Text (nur die Getreide-Namen). */
export function findGlutenSources(text: string): string[] {
  return [...new Set(findGlutenMatches(text).flatMap((m) => m.cereal.split(', ')))]
}

/** Liefert die Texte aller Spurenhinweise ("Kann Spuren von ... enthalten"). */
export function findTraceStatements(text: string): { statements: string[]; rest: string } {
  const statements: string[] = []
  let rest = text
  for (const re of TRACE_PATTERNS) {
    rest = rest.replace(re, (_full, content: string) => {
      const segment = content.replace(/^[\s:,]+|[\s,]+$/g, '')
      if (segment && !statements.includes(segment)) statements.push(segment)
      return ' '
    })
  }
  return { statements, rest }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime())
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function classify(input: ClassificationInput): Classification {
  const now = input.now ?? new Date()
  const ingredients = normalizeText(input.ingredientsText)
  const label = normalizeText(input.labelText)
  const text = [ingredients, label].filter(Boolean).join(' . ')
  const tags = (input.externalTags ?? []).map((t) => t.toLowerCase())
  const reasons: string[] = []
  const explanation: ExplanationItem[] = []
  /** Begründung hinzufügen; gefundene Wörter erscheinen im Text (gespeichert) und strukturiert (zum Hervorheben). */
  const add = (text: string, words?: GlutenMatch[]) => {
    explanation.push({ text, words })
    reasons.push(words?.length ? `${text} ${words.map((w) => `„${w.word}“`).join(', ')}` : text)
  }

  // --- Herstellerbestätigung (max. 6 Monate alt) ---
  const positive = (input.confirmations ?? [])
    .filter((c) => c.confirms_gluten_free)
    .sort((a, b) => b.confirmed_at.localeCompare(a.confirmed_at))
  const latest = positive[0]
  let confirmationValidUntil: string | null = null
  let confirmationValid = false
  if (latest) {
    const until = addMonths(new Date(latest.confirmed_at + 'T00:00:00Z'), CONFIRMATION_VALID_MONTHS)
    confirmationValidUntil = formatDate(until)
    confirmationValid = until.getTime() >= now.getTime()
  }
  const latestAny = [...(input.confirmations ?? [])].sort((a, b) =>
    b.confirmed_at.localeCompare(a.confirmed_at),
  )[0]
  const manufacturerDenied = latestAny && !latestAny.confirms_gluten_free

  // --- Zertifizierung ---
  const certifiedByTag = tags.some((t) =>
    /^labels:.*(crossed-grain|aoecs|certified-gluten-free)/.test(t),
  )
  const certifiedByText = CERTIFICATION_TEXT.test(text)
  const certified = Boolean(input.certifiedLabel) || certifiedByTag

  // Spurenhinweise stehen oft mitten in der Zutatenliste – vor der Zutatensuche entfernen.
  // Gesucht wird im gesamten Text: Die Texterkennung vermischt mehrspaltige Etiketten,
  // sodass Zutaten außerhalb des erkannten Zutatenblocks landen können. Ein Fehlalarm
  // ist bei Zöliakie harmloser als eine übersehene Glutenquelle.
  const { statements: traces } = findTraceStatements(text)
  const inIngredients = findGlutenMatches(findTraceStatements(ingredients).rest)
  const seen = new Set(inIngredients.map((m) => m.word.toLowerCase()))
  const inLabel = findGlutenMatches(findTraceStatements(label).rest).filter((m) => !seen.has(m.word.toLowerCase()))
  const glutenFindings: GlutenFinding[] = [
    ...inIngredients.map((m) => ({ ...m, where: 'zutaten' as const })),
    ...inLabel.map((m) => ({ ...m, where: 'verpackung' as const })),
  ]
  const glutenSources = [...new Set(glutenFindings.flatMap((f) => f.cereal.split(', ')))]
  const glutenTraces = traces.filter((t) => findGlutenSources(t).length > 0)
  if (tags.includes('allergens:en:gluten') && !glutenSources.includes('Gluten')) {
    glutenSources.push('Gluten (laut Open Food Facts)')
    glutenFindings.push({ word: 'Gluten', cereal: 'Gluten (laut Open Food Facts)', where: 'datenbank' })
  }

  // 1) Sicher glutenfrei lt. Hersteller (Logo oder Herstellerbestätigung)
  if (!manufacturerDenied && (certified || confirmationValid)) {
    if (certified) {
      add(
        input.certifiedLabel
          ? 'Zertifizierungslogo (durchgestrichene Ähre) auf der Verpackung bestätigt.'
          : 'Zertifiziert glutenfrei laut externer Datenbank.',
      )
    }
    if (confirmationValid) {
      add(
        `Hersteller hat am ${latest.confirmed_at} Glutenfreiheit bestätigt (gültig bis ${confirmationValidUntil}).`,
      )
    }
    if (glutenSources.length) {
      add(
        `Hinweis: Zutatenliste nennt ${glutenSources.join(', ')} – bei zertifizierten Produkten unter 20 ppm (z. B. glutenfreie Weizenstärke).`,
      )
    }
    return { status: 'verified_gluten_free', reasons, explanation, glutenFindings, glutenSources, traces, confirmationValidUntil }
  }

  if (manufacturerDenied) {
    add(`Hersteller hat am ${latestAny.confirmed_at} Glutenfreiheit NICHT bestätigt.`)
  } else if (latest && !confirmationValid) {
    add(
      `Herstellerbestätigung vom ${latest.confirmed_at} ist abgelaufen (älter als ${CONFIRMATION_VALID_MONTHS} Monate) – bitte erneut anfragen.`,
    )
  }
  if (certifiedByText && !certified) {
    add(
      'Text deutet auf eine Zertifizierung hin – bitte Logo auf der Verpackung prüfen und bestätigen.',
    )
  }

  // 2) Enthält Gluten
  if (glutenSources.length) {
    const where = (w: GlutenFinding['where']) => glutenFindings.filter((f) => f.where === w)
    if (where('zutaten').length) add('In der Zutatenliste stehen glutenhaltige Zutaten:', where('zutaten'))
    if (where('verpackung').length) add('Im erkannten Verpackungstext stehen glutenhaltige Wörter:', where('verpackung'))
    if (where('datenbank').length) add('Open Food Facts führt Gluten als Allergen auf.')
    return { status: 'contains_gluten', reasons, explanation, glutenFindings, glutenSources, traces, confirmationValidUntil }
  }

  // 3) Spuren von Gluten
  const traceTagsGluten = tags.some((t) => t === 'traces:en:gluten')
  if (glutenTraces.length || traceTagsGluten || manufacturerDenied) {
    if (glutenTraces.length)
      add('Spurenhinweis auf der Verpackung – mögliche Spuren von:', findGlutenMatches(glutenTraces.join(' ')))
    if (traceTagsGluten) add('Open Food Facts listet Gluten als mögliche Spur.')
    return { status: 'may_contain_gluten', reasons, explanation, glutenFindings, glutenSources, traces, confirmationValidUntil }
  }

  // 4) Keine glutenhaltigen Zutaten (auch wenn „glutenfrei“ draufsteht, aber ohne Logo/Bestätigung)
  const claim =
    GLUTEN_FREE_CLAIM.test(text) || tags.some((t) => /^labels:.*(gluten-free|no-gluten)/.test(t))
  if (ingredients || claim || traces.length) {
    if (input.ingredientsReliable === false) {
      add('Die Zutatenliste wurde unsicher gelesen – bitte prüfen oder korrigieren, bevor du dich darauf verlässt.')
      return { status: 'unknown', reasons, explanation, glutenFindings, glutenSources, traces, confirmationValidUntil }
    }
    add('Keine glutenhaltigen Zutaten gefunden.')
    if (claim)
      add('„Glutenfrei“ steht auf der Verpackung, bei der Datenbank oder Hersteller-Website – aber ohne Zertifizierungslogo.')
    if (traces.length) add(`Spurenhinweis ohne Gluten: „${traces.join('; ')}“.`)
    add('Kreuzkontamination (Spuren) ist nicht ausgeschlossen.')
    add(
      'Für „Sicher glutenfrei“: Hersteller anfragen (gilt 6 Monate) oder Zertifizierungslogo bestätigen.',
    )
    return { status: 'unverified_gluten_free', reasons, explanation, glutenFindings, glutenSources, traces, confirmationValidUntil }
  }

  add('Zu wenig Informationen. Bitte die Zutatenliste fotografieren.')
  return { status: 'unknown', reasons, explanation, glutenFindings, glutenSources, traces, confirmationValidUntil }
}

export const STATUS_META: Record<GlutenStatus, { label: string; short: string; tone: string }> = {
  verified_gluten_free: { label: 'Sicher glutenfrei lt. Hersteller', short: 'Sicher', tone: 'green' },
  unverified_gluten_free: { label: 'Keine glutenhaltigen Zutaten', short: 'Keine Gluten-Zutat', tone: 'lime' },
  may_contain_gluten: { label: 'Kann Spuren von Gluten enthalten', short: 'Spuren', tone: 'orange' },
  contains_gluten: { label: 'Enthält Gluten', short: 'Gluten', tone: 'red' },
  unknown: { label: 'Unbekannt', short: '?', tone: 'grey' },
}
