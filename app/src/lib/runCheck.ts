// Eine Prüfung: 1. Barcode → Produkt (eigene Datenbank, Open Food Facts), 2. Zutaten vom Foto (Bild-KI, sonst
// Texterkennung im Browser), 3. Hersteller-/Markenseite, 4. Open Food Facts ergänzt, 5. Abgleich.
// Beschreibung: features/scan-page/FEATURE.md
import type {
  CheckNote,
  Draft,
  Identity,
  IngredientInfo,
  Product,
  ProductInput,
  SourceId,
  SourceList,
  StepReport,
} from '../types'
import { STATUS_META, findTraceStatements, normalizeText } from './classify'
import { eanCandidatesFromText, isValidEan } from './ean'
import { buildLabelText, splitSourceLines } from './labelText'
import type { ManufacturerQuery, ManufacturerResult } from './manufacturer'
import type { LabelReading, LabelResult } from './labelReader'
import type { OcrResult } from './ocr'
import type { ExternalProduct } from './openFoodFacts'
import { compareLists } from './ingredientsCompare'
import { reconcile } from './reconcile'
import { SOURCE_NAME } from './sources'
import { tagNames } from './tagLabels'
import { extractCompany, extractIngredientBlock, extractWebsites, parseIngredients, tidyRawText } from './textClean'

export interface CheckDeps {
  decodeBarcode(file: Blob): Promise<string | null>
  recognizeText(file: Blob, onProgress?: (p: number) => void): Promise<OcrResult>
  getByBarcode(code: string): Promise<Product | null>
  lookupOpenFoodFacts(code: string): Promise<ExternalProduct | null>
  lookupManufacturer(q: ManufacturerQuery): Promise<ManufacturerResult | null>
  /** Bild-KI; fehlt sie oder liefert sie nichts, liest die Texterkennung im Browser */
  readLabel?(files: Blob[]): Promise<LabelResult>
}

export type StepId = SourceId | 'abgleich'
export interface ProgressStep {
  id: StepId
  label: string
  state: 'wartet' | 'läuft' | 'fertig'
  detail?: string
}

export const STEP_LABELS: Record<StepId, string> = {
  datenbank: 'Barcode: Produkt bestimmen',
  foto: 'Zutaten vom Foto lesen',
  hersteller: 'Hersteller- und Markenseite durchsuchen',
  openfoodfacts: 'Open Food Facts ergänzen',
  abgleich: 'Quellen abgleichen',
}
const ORDER: StepId[] = ['datenbank', 'foto', 'hersteller', 'openfoodfacts', 'abgleich']

export const EMPTY_INPUT: ProductInput = {
  barcode: null,
  name: null,
  brand: null,
  ingredients_text: null,
  label_text: null,
  certified_label: false,
  certification_note: null,
  image_url: null,
}

export function stripProduct(p: Product): ProductInput {
  const { id: _i, created_at: _c, updated_at: _u, info_updated_at: _t, confirmations: _k, status: _s, status_reasons: _r, ...rest } = p
  return rest
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')

export function listOf(source: SourceId, text: string | null | undefined, extra: Partial<SourceList> = {}): SourceList | null {
  if (!text?.trim()) return null
  const { items, traces } = parseIngredients(text)
  // Gespeichert wird die bereinigte Liste; Spurenhinweise bleiben als Satz dabei, denn sie zählen zur Zutatenliste
  // (nur daraus wird auf Gluten geschlossen). Der übrige Verpackungstext bleibt im Rohtext des Fotos.
  const full = [items.join(', '), ...traces.map((t) => t.replace(/[.\s]+$/, ''))].join('. ')
  return items.length ? { source, text: full, items, quality: 'gut', ...extra } : null
}

/** Alles, was das Sammeln der Quellen ergeben hat. Daraus entsteht das Ergebnis (`assembleDraft`). */
export interface CheckContext {
  code: string | null
  from: Identity['from']
  fileCount: number
  ocrText: string | null
  photoList: SourceList | null
  photoCompany: string | null
  websites: string[]
  hints: string[]
  existing: Product | null
  /** Open Food Facts zum Barcode (gekennzeichnet als „laut Open Food Facts“) */
  external: ExternalProduct | null
  offError: boolean
  /** Wie die Fotos gelesen wurden; `reading` nur bei der Bild-KI */
  reader: 'ki' | 'texterkennung' | null
  reading: LabelReading | null
  readError?: string
  /** Wurde auf der Hersteller-Website gesucht? (Sonst fehlten Angaben zum Suchen) */
  searched: boolean
  manufacturer: ManufacturerResult | null
  /** Ein gespeichertes Produkt wird nur bearbeitet (keine Prüfung durchgeführt) */
  edit?: boolean
}

const mfrListOf = (m: ManufacturerResult | null) =>
  m?.found && m.ingredients ? listOf('hersteller', m.ingredients, { url: m.sourceUrl, exact: m.exact }) : null

function reportPhoto(c: CheckContext): StepReport {
  if (c.fileCount === 0) return { source: 'foto', status: 'skipped', summary: 'Kein Foto – nur der Barcode wurde eingegeben.' }
  const how = c.reader === 'ki' ? ' (Bild-KI)' : c.reader === 'texterkennung' ? ' (Texterkennung im Browser)' : ''
  if (!c.photoList) return { source: 'foto', status: 'none', summary: `Auf den Fotos wurde keine Zutatenliste erkannt${how}.` }
  const good = c.photoList.quality === 'gut'
  return { source: 'foto', status: 'found', summary: `${c.photoList.items.length} Zutaten gelesen${good ? '' : ' – nicht alles sicher lesbar'}${how}.` }
}

/** Schritt 1: Produkt per Barcode – aus eurer Datenbank und Open Food Facts. */
function reportDb(c: CheckContext): StepReport {
  if (!c.code)
    return { source: 'datenbank', status: c.fileCount ? 'none' : 'skipped', summary: 'Kein Barcode erkannt – weiter mit den Fotos.' }
  const name = c.existing?.name ?? c.external?.name
  const brand = c.existing?.brand ?? c.external?.brand
  const product = name ? `${[brand, name].filter(Boolean).join(' – ')}` : null
  if (c.existing)
    return { source: 'datenbank', status: 'found', summary: `${product ?? 'Produkt'} – bereits gespeichert: ${STATUS_META[c.existing.status].label}.` }
  if (c.external) return { source: 'datenbank', status: 'found', summary: `${product ?? 'Produkt gefunden'} (laut Open Food Facts) – noch nicht in eurer Datenbank.` }
  if (c.offError) return { source: 'datenbank', status: 'error', summary: 'Barcode erkannt, aber Open Food Facts ist nicht erreichbar.' }
  return { source: 'datenbank', status: 'none', summary: 'Barcode erkannt, aber weder in eurer Datenbank noch bei Open Food Facts bekannt.' }
}

function reportOff(c: CheckContext): StepReport {
  if (c.external) {
    const list = listOf('openfoodfacts', c.external.ingredientsText)
    return {
      source: 'openfoodfacts',
      status: 'found',
      summary: list ? `${list.items.length} Zutaten, Allergene und Spuren laut Open Food Facts.` : 'Produkt bekannt, aber ohne Zutatenliste.',
      url: c.code ? `https://world.openfoodfacts.org/product/${c.code}` : null,
    }
  }
  if (c.offError) return { source: 'openfoodfacts', status: 'error', summary: 'Open Food Facts ist nicht erreichbar.' }
  return c.code
    ? { source: 'openfoodfacts', status: 'none', summary: 'Der Barcode ist bei Open Food Facts nicht bekannt.' }
    : { source: 'openfoodfacts', status: 'skipped', summary: 'Ohne Barcode keine Abfrage möglich.' }
}

function reportMfr(c: CheckContext): StepReport {
  const list = mfrListOf(c.manufacturer)
  if (list)
    return {
      source: 'hersteller',
      status: 'found',
      summary: `Zutaten gefunden (${host(list.url!)}${c.manufacturer?.source === 'haendler' ? ', Händlerseite' : ''})${list.exact ? '' : ' – nicht eindeutig dasselbe Produkt'}.`,
      url: list.url,
    }
  if (!c.searched) return { source: 'hersteller', status: 'skipped', summary: 'Zu wenig Angaben zum Suchen (Produktname oder Barcode fehlt).' }
  if (!c.manufacturer) return { source: 'hersteller', status: 'error', summary: 'Die Suche auf der Hersteller-Website ist gerade nicht erreichbar.' }
  return { source: 'hersteller', status: 'none', summary: c.manufacturer.message }
}

/**
 * Gleicht die gesammelten Quellen ab und stellt Zutaten, Hinweise und Produktangaben zusammen.
 * `override`: vom Nutzer eingegebene Angaben, die Vorrang haben.
 */
export function assembleDraft(c: CheckContext, override: { name?: string | null; brand?: string | null } = {}): Draft {
  const { existing, manufacturer } = c
  const from = { ...c.from }
  const notes: CheckNote[] = []

  // Produkt, Hersteller, Barcode – aus allen Quellen, mit Herkunft
  const identity: Identity = { name: null, brand: null, company: null, barcode: c.code, from }
  const { external, reading } = c
  if (override.name) [identity.name, from.name] = [override.name, 'eingegeben']
  else if (existing?.name) [identity.name, from.name] = [existing.name, SOURCE_NAME.datenbank]
  else if (external?.name) [identity.name, from.name] = [external.name, SOURCE_NAME.openfoodfacts]
  else if (reading?.product_name) [identity.name, from.name] = [reading.product_name, 'Verpackung']
  if (override.brand) [identity.brand, from.brand] = [override.brand, 'eingegeben']
  else if (existing?.brand) [identity.brand, from.brand] = [existing.brand, SOURCE_NAME.datenbank]
  else if (external?.brand) [identity.brand, from.brand] = [external.brand, SOURCE_NAME.openfoodfacts]
  else if (reading?.brand) [identity.brand, from.brand] = [reading.brand, 'Verpackung']
  if (external?.company) [identity.company, from.company] = [external.company, SOURCE_NAME.openfoodfacts]
  else if (reading?.manufacturer) [identity.company, from.company] = [reading.manufacturer, 'Verpackung']
  else if (c.photoCompany) [identity.company, from.company] = [c.photoCompany, 'Verpackung']
  const mfrList = mfrListOf(manufacturer)
  if (!identity.name && mfrList?.exact && manufacturer?.title && manufacturer.title.length <= 80)
    [identity.name, from.name] = [manufacturer.title, SOURCE_NAME.hersteller]

  // Abgleich der Zutatenlisten
  const dbList = listOf('datenbank', existing?.ingredients_text)
  const offList = listOf('openfoodfacts', external?.ingredientsText)
  const lists = [c.photoList, mfrList, offList, dbList].filter((l): l is SourceList => l !== null)
  const result = reconcile(lists)

  // Hinweise: Spuren, Allergene, Aussagen, Unterschiede
  if (c.ocrText) {
    const traces = findTraceStatements(normalizeText(c.ocrText)).statements
    if (traces.length) notes.push({ level: 'info', text: `Spurenhinweis auf der Verpackung: ${sentence(traces.join('; '))}.` })
  }
  if (reading?.unreadable.length)
    notes.push({ level: 'warn', text: `Auf dem Foto nicht sicher lesbar: ${reading.unreadable.join('; ')} – bitte auf der Packung prüfen.` })
  notes.push(...result.notes)
  for (const s of manufacturer?.glutenStatements ?? []) notes.push({ level: 'info', text: `Hersteller-Website: „${s}“` })
  if (manufacturer?.allergens) notes.push({ level: 'info', text: `Allergene laut Hersteller-Website: ${manufacturer.allergens}` })
  const alt = mfrList && manufacturer?.alternative ? listOf('hersteller', manufacturer.alternative.ingredients) : null
  if (alt && mfrList && manufacturer?.alternative) {
    const site = host(manufacturer.alternative.url)
    const same = compareLists(mfrList.items, alt.items).similarity >= 0.8
    notes.push(
      same
        ? { level: 'info', text: `Eine zweite Seite (${site}) nennt dieselben Zutaten.` }
        : { level: 'warn', text: `Eine zweite Seite (${site}) nennt abweichende Zutaten – bitte mit der Packung vergleichen.` },
    )
  }
  if (external) {
    const allergens = tagNames(external.tags, 'allergens')
    const traces = tagNames(external.tags, 'traces')
    if (allergens.length) notes.push({ level: 'info', text: `Allergene laut Open Food Facts: ${allergens.join(', ')}.` })
    if (traces.length) notes.push({ level: 'info', text: `Spuren laut Open Food Facts: ${traces.join(', ')}.` })
  }
  notes.sort((x, y) => (x.level === y.level ? 0 : x.level === 'warn' ? -1 : 1))

  const chosen = result.chosen
  const previousLabel = existing?.label_text
    ? splitSourceLines(existing.label_text).rest.split('\n').filter((l) => !l.startsWith('Hersteller-Website:')).join('\n').trim() || null
    : null
  const input: ProductInput = {
    ...EMPTY_INPUT,
    ...(existing ? stripProduct(existing) : {}),
    barcode: c.code,
    name: identity.name,
    brand: identity.brand ?? identity.company,
    ingredients_text: chosen?.text ?? null,
    label_text:
      [
        buildLabelText({
          ocrText: c.ocrText ?? previousLabel,
          lists,
          chosen: chosen?.source ?? null,
          statements: manufacturer?.glutenStatements ?? [],
        }),
        // Zweite Hersteller-/Händlerseite: zählt bei Gluten-Widersprüchen wie jede weitere Quelle
        alt && manufacturer?.alternative ? `Quelle ${host(manufacturer.alternative.url)}: ${alt.text}` : null,
      ]
        .filter(Boolean)
        .join('\n') || null,
    image_url: existing?.image_url ?? (manufacturer?.exact ? manufacturer.imageUrl : null) ?? external?.imageUrl ?? null,
  }
  const reports = [reportDb(c), reportPhoto(c), reportMfr(c), reportOff(c)]
  const ingredients: IngredientInfo = {
    source: chosen?.source ?? null,
    trusted: chosen ? !(chosen.source === 'foto' && chosen.quality === 'unsicher') : false,
    url: chosen?.url ?? null,
    exact: chosen?.source === 'hersteller' ? chosen.exact : undefined,
    lookup: mfrList ? 'found' : !c.searched ? 'skipped' : !manufacturer ? 'unavailable' : 'not-found',
    message: manufacturer?.message ?? null,
  }
  return {
    input,
    existing,
    ocrText: c.ocrText,
    sources: reports.filter((r) => r.status === 'found').map((r) => SOURCE_NAME[r.source]),
    ingredients,
    websites: c.websites,
    hints: c.hints,
    context: c,
    check: {
      identity,
      steps: ORDER.filter((id): id is SourceId => id !== 'abgleich').map((id) => reports.find((r) => r.source === id)!),
      lists,
      chosen: chosen?.source ?? null,
      reconciliation: result.reconciliation,
      notes,
    },
  }
}

export async function runCheck(
  deps: CheckDeps,
  input: { files: Blob[]; barcode: string; /** vom Nutzer eingegebene Angaben (z. B. beim Nachreichen weiterer Fotos) */ name?: string | null; brand?: string | null },
  onProgress: (steps: ProgressStep[]) => void = () => {},
): Promise<Draft> {
  const progress: ProgressStep[] = ORDER.map((id) => ({ id, label: STEP_LABELS[id], state: 'wartet' }))
  const set = (id: StepId, state: ProgressStep['state'], detail?: string) => {
    const step = progress.find((p) => p.id === id)!
    step.state = state
    step.detail = detail
    onProgress(progress.map((p) => ({ ...p })))
  }
  onProgress(progress.map((p) => ({ ...p })))

  const ctx: CheckContext = {
    code: input.barcode.trim() || null,
    from: input.barcode.trim() ? { barcode: 'eingetippt' } : {},
    fileCount: input.files.length,
    ocrText: null,
    photoList: null,
    photoCompany: null,
    websites: [],
    hints: [],
    existing: null,
    external: null,
    offError: false,
    reader: null,
    reading: null,
    searched: false,
    manufacturer: null,
  }
  const from = ctx.from
  /** Barcode in eurer Datenbank und bei Open Food Facts nachschlagen. `guessed`: Ziffern nur vom Foto gelesen. */
  const lookup = async (code: string, guessed: boolean) => {
    const [ex, ext] = await Promise.all([
      deps.getByBarcode(code).catch(() => null),
      deps.lookupOpenFoodFacts(code).catch(() => {
        ctx.offError = true
        return null
      }),
    ])
    // Geratene Ziffern zählen nur, wenn eine Quelle das Produkt kennt
    if (guessed && !ex && !ext) return false
    ctx.code = code
    ctx.existing = ex
    ctx.external = ext
    return true
  }

  // ---- 1. Barcode → eindeutiges Produkt
  set('datenbank', 'läuft', 'Barcode suchen …')
  if (!ctx.code) {
    for (const f of input.files) {
      const code = await deps.decodeBarcode(f)
      if (code) {
        ctx.code = code
        from.barcode = 'Foto'
        break
      }
    }
  }
  if (ctx.code) {
    set('datenbank', 'läuft', 'Produkt nachschlagen …')
    await lookup(ctx.code, false)
  }
  set('datenbank', 'fertig', reportDb(ctx).summary)

  // ---- 2. Zutaten vom Foto: zuerst Bild-KI, sonst Texterkennung im Browser
  set('foto', 'läuft', input.files.length ? 'Fotos lesen …' : undefined)
  if (input.files.length && deps.readLabel) {
    set('foto', 'läuft', 'Bild-KI liest die Fotos …')
    const result = await deps.readLabel(input.files).catch(() => ({ reading: null }) as LabelResult)
    ctx.readError = result.error
    const r = result.reading
    if (r) {
      ctx.reader = 'ki'
      ctx.reading = r
      const ingredients = [r.ingredients, r.traces].map((t) => t.trim().replace(/[.\s]+$/, '')).filter(Boolean).join('. ')
      ctx.photoList = listOf('foto', ingredients, { quality: r.ingredients_complete && r.unreadable.length === 0 ? 'gut' : 'unsicher' })
      ctx.ocrText =
        [
          [r.brand, r.product_name].filter(Boolean).join(' '),
          r.manufacturer,
          r.ingredients && `Zutaten: ${r.ingredients}`,
          r.traces,
          ...r.websites,
        ]
          .filter(Boolean)
          .join('\n') || null
      ctx.photoCompany = r.manufacturer || null
      ctx.websites = [...new Set([...r.websites.map((w) => (/^https?:/.test(w) ? w : `https://${w.replace(/^\/+/, '')}`)), ...extractWebsites(ctx.ocrText ?? '')])]
      ctx.hints = [
        ...new Set(
          (ctx.photoList?.items ?? [])
            .flatMap((i) => i.split(/[^\p{L}]+/u))
            .filter((w) => w.length >= 5),
        ),
      ].slice(0, 10)
    }
  }
  if (input.files.length && !ctx.reader) {
    ctx.reader = 'texterkennung'
    const results: OcrResult[] = []
    for (const [i, f] of input.files.entries()) {
      const label = `Text lesen (Foto ${i + 1}/${input.files.length})`
      set('foto', 'läuft', `${label} …`)
      results.push(await deps.recognizeText(f, (p) => set('foto', 'läuft', `${label} … ${Math.round(p * 100)} %`)))
    }
    ctx.ocrText = results.map((r) => tidyRawText(r.lines)).filter(Boolean).join('\n\n') || null
    const block = extractIngredientBlock(results.flatMap((r) => r.lines))
    ctx.photoList = block ? listOf('foto', block.text, { quality: block.trusted ? 'gut' : 'unsicher' }) : null
    ctx.photoCompany = ctx.ocrText ? extractCompany(ctx.ocrText) : null
    ctx.websites = extractWebsites(ctx.ocrText ?? '')
    ctx.hints = block?.hints ?? []
  }
  set('foto', 'fertig', reportPhoto(ctx).summary)

  // Kein Strichcode lesbar: die aufgedruckten Ziffern (Bild-KI oder Texterkennung) nachschlagen
  if (!ctx.code) {
    const printed = ctx.reading?.barcode.replace(/\D/g, '') ?? ''
    const candidates = [...new Set([...(isValidEan(printed) ? [printed] : []), ...eanCandidatesFromText(ctx.ocrText ?? '')])].slice(0, 4)
    for (const c of candidates) {
      if (await lookup(c, true)) {
        from.barcode = 'Ziffern unter dem Strichcode'
        set('datenbank', 'fertig', reportDb(ctx).summary)
        break
      }
    }
  }

  // ---- 3. Hersteller- und Markenseite: gesucht wird nach Marke + Produktname
  set('hersteller', 'läuft', 'Website durchsuchen …')
  const name = input.name || (ctx.existing?.name ?? ctx.external?.name ?? ctx.reading?.product_name ?? null)
  const brand = input.brand || (ctx.existing?.brand ?? ctx.external?.brand ?? (ctx.reading?.brand || null) ?? ctx.external?.company ?? ctx.photoCompany)
  ctx.searched = Boolean(name || ctx.code || ctx.hints.length >= 3)
  if (ctx.searched)
    ctx.manufacturer = await deps.lookupManufacturer({
      name,
      brand,
      barcode: ctx.code,
      urls: [...(ctx.external?.link ? [ctx.external.link] : []), ...ctx.websites].slice(0, 4),
      hints: ctx.hints,
    })
  set('hersteller', 'fertig', reportMfr(ctx).summary)

  // ---- 4. Open Food Facts ergänzt (wurde mit dem Barcode schon abgefragt)
  set('openfoodfacts', 'fertig', reportOff(ctx).summary)

  // ---- 5. Abgleich
  set('abgleich', 'läuft', 'Quellen vergleichen …')
  const draft = assembleDraft(ctx, { name: input.name, brand: input.brand })
  set('abgleich', 'fertig', draft.check.reconciliation.summary)
  return draft
}

/** Ausgangslage beim Bearbeiten eines gespeicherten Produkts (keine neue Prüfung). */
export function draftFromProduct(product: Product): Draft {
  return assembleDraft({
    code: product.barcode,
    from: { barcode: SOURCE_NAME.datenbank },
    fileCount: 0,
    ocrText: null,
    photoList: null,
    photoCompany: null,
    websites: [],
    hints: [],
    existing: product,
    external: null,
    offError: false,
    reader: null,
    reading: null,
    searched: false,
    manufacturer: null,
    edit: true,
  })
}
