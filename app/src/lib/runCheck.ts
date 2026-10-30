// Eine Prüfung: Fotos lesen, Hersteller-Website, Open Food Facts und eigene Datenbank befragen, die Ergebnisse
// miteinander abgleichen und Zutaten samt Hinweisen zusammenstellen. Beschreibung: features/scan-page/FEATURE.md
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
import { eanCandidatesFromText } from './ean'
import { buildLabelText, splitSourceLines } from './labelText'
import type { ManufacturerQuery, ManufacturerResult } from './manufacturer'
import type { OcrResult } from './ocr'
import type { ExternalProduct } from './openFoodFacts'
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
}

export type StepId = SourceId | 'abgleich'
export interface ProgressStep {
  id: StepId
  label: string
  state: 'wartet' | 'läuft' | 'fertig'
  detail?: string
}

export const STEP_LABELS: Record<StepId, string> = {
  foto: 'Fotos prüfen',
  hersteller: 'Herstellerseite durchsuchen',
  openfoodfacts: 'Open Food Facts abrufen',
  datenbank: 'Mit eurer Datenbank abgleichen',
  abgleich: 'Quellen abgleichen',
}
const ORDER: StepId[] = ['foto', 'hersteller', 'openfoodfacts', 'datenbank', 'abgleich']

export const EMPTY_INPUT: ProductInput = {
  barcode: null,
  name: null,
  brand: null,
  ingredients_text: null,
  label_text: null,
  certified_label: false,
  certification_note: null,
  external_tags: [],
  image_url: null,
}

export function stripProduct(p: Product): ProductInput {
  const { id: _i, created_at: _c, updated_at: _u, confirmations: _k, status: _s, status_reasons: _r, ...rest } = p
  return rest
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')
const words = (s: string) => normalizeText(s).split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 3)

function listOf(source: SourceId, text: string | null | undefined, extra: Partial<SourceList> = {}): SourceList | null {
  if (!text?.trim()) return null
  const items = parseIngredients(text).items
  // Gespeichert wird die bereinigte Liste (nur Zutaten); Spurenhinweise und Rest bleiben im Rohtext des Fotos
  return items.length ? { source, text: items.join(', '), items, quality: 'gut', ...extra } : null
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
  external: ExternalProduct | null
  offError: boolean
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
  if (!c.photoList) return { source: 'foto', status: 'none', summary: 'Auf den Fotos wurde keine Zutatenliste erkannt.' }
  const good = c.photoList.quality === 'gut'
  return { source: 'foto', status: 'found', summary: `${c.photoList.items.length} Zutaten gelesen${good ? ' (gut lesbar)' : ' – schwer lesbar'}.` }
}

function reportOff(c: CheckContext): StepReport {
  if (c.external) {
    const list = listOf('openfoodfacts', c.external.ingredientsText)
    return {
      source: 'openfoodfacts',
      status: 'found',
      summary: `Produkt gefunden${c.external.name ? `: ${c.external.name}` : ''} · ${list ? `${list.items.length} Zutaten` : 'ohne Zutatenliste'}.`,
    }
  }
  if (c.offError) return { source: 'openfoodfacts', status: 'error', summary: 'Open Food Facts ist nicht erreichbar.' }
  return c.code
    ? { source: 'openfoodfacts', status: 'none', summary: 'Der Barcode ist in Open Food Facts nicht bekannt.' }
    : { source: 'openfoodfacts', status: 'skipped', summary: 'Ohne Barcode kein Abruf möglich.' }
}

function reportDb(c: CheckContext): StepReport {
  if (c.existing) return { source: 'datenbank', status: 'found', summary: `Bereits gespeichert: ${STATUS_META[c.existing.status].label}.` }
  return c.code
    ? { source: 'datenbank', status: 'none', summary: 'Noch nicht in eurer Datenbank.' }
    : { source: 'datenbank', status: 'skipped', summary: 'Ohne Barcode kein Abgleich möglich.' }
}

function reportMfr(c: CheckContext): StepReport {
  const list = mfrListOf(c.manufacturer)
  if (list)
    return {
      source: 'hersteller',
      status: 'found',
      summary: `Zutaten gefunden (${host(list.url!)})${list.exact ? '' : ' – nicht eindeutig dasselbe Produkt'}.`,
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
  const { existing, external, manufacturer } = c
  const from = { ...c.from }
  const notes: CheckNote[] = []

  // Produkt, Hersteller, Barcode – aus allen Quellen, mit Herkunft
  const identity: Identity = { name: null, brand: null, company: null, barcode: c.code, from }
  if (override.name) [identity.name, from.name] = [override.name, 'eingegeben']
  else if (existing?.name) [identity.name, from.name] = [existing.name, SOURCE_NAME.datenbank]
  else if (external?.name) [identity.name, from.name] = [external.name, SOURCE_NAME.openfoodfacts]
  if (override.brand) [identity.brand, from.brand] = [override.brand, 'eingegeben']
  else if (existing?.brand) [identity.brand, from.brand] = [existing.brand, SOURCE_NAME.datenbank]
  else if (external?.brand) [identity.brand, from.brand] = [external.brand, SOURCE_NAME.openfoodfacts]
  if (external?.company) [identity.company, from.company] = [external.company, SOURCE_NAME.openfoodfacts]
  else if (c.photoCompany) [identity.company, from.company] = [c.photoCompany, 'Verpackung']
  const mfrList = mfrListOf(manufacturer)
  if (!identity.name && mfrList?.exact && manufacturer?.title && manufacturer.title.length <= 80)
    [identity.name, from.name] = [manufacturer.title, SOURCE_NAME.hersteller]

  // Abgleich der Zutatenlisten
  const offList = listOf('openfoodfacts', external?.ingredientsText)
  const dbList = listOf('datenbank', existing?.ingredients_text)
  const lists = [c.photoList, mfrList, offList, dbList].filter((l): l is SourceList => l !== null)
  const result = reconcile(lists)

  // Hinweise: Spuren, Allergene, Aussagen, Unterschiede
  if (c.ocrText) {
    const traces = findTraceStatements(normalizeText(c.ocrText)).statements
    if (traces.length) notes.push({ level: 'info', text: `Spurenhinweis auf der Verpackung: ${sentence(traces.join('; '))}.` })
  }
  notes.push(...result.notes)
  if (external) {
    const traces = tagNames(external.tags, 'traces')
    const allergens = tagNames(external.tags, 'allergens')
    if (allergens.length) notes.push({ level: 'info', text: `Allergene laut Open Food Facts: ${allergens.join(', ')}.` })
    if (traces.length) notes.push({ level: 'info', text: `Spuren laut Open Food Facts: ${traces.join(', ')}.` })
    if (external.tags.some((t) => /^labels:.*gluten-free/.test(t)))
      notes.push({ level: 'info', text: 'Open Food Facts führt das Label „glutenfrei“ auf.' })
  }
  for (const s of manufacturer?.glutenStatements ?? []) notes.push({ level: 'info', text: `Hersteller-Website: „${s}“` })
  if (manufacturer?.allergens) notes.push({ level: 'info', text: `Allergene laut Hersteller-Website: ${manufacturer.allergens}` })
  if (existing?.name && external?.name) {
    const a = new Set(words(existing.name))
    if (a.size && !words(external.name).some((w) => a.has(w)))
      notes.push({ level: 'warn', text: `Der Name weicht ab: Datenbank „${existing.name}“, Open Food Facts „${external.name}“.` })
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
    label_text: buildLabelText({
      ocrText: c.ocrText ?? previousLabel,
      lists,
      chosen: chosen?.source ?? null,
      statements: manufacturer?.glutenStatements ?? [],
    }),
    external_tags: external?.tags ?? existing?.external_tags ?? [],
    image_url: existing?.image_url ?? external?.imageUrl ?? null,
  }
  const reports = [reportPhoto(c), reportMfr(c), reportOff(c), reportDb(c)]
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
  input: { files: Blob[]; barcode: string },
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

  // ---- 1. Fotos prüfen
  set('foto', 'läuft', 'Barcode suchen …')
  let code = input.barcode.trim() || null
  const from: Identity['from'] = code ? { barcode: 'eingetippt' } : {}
  if (!code) {
    for (const f of input.files) {
      code = await deps.decodeBarcode(f)
      if (code) {
        from.barcode = 'Foto'
        break
      }
    }
  }
  const results: OcrResult[] = []
  for (const [i, f] of input.files.entries()) {
    const label = `Text lesen (Foto ${i + 1}/${input.files.length})`
    set('foto', 'läuft', `${label} …`)
    results.push(await deps.recognizeText(f, (p) => set('foto', 'läuft', `${label} … ${Math.round(p * 100)} %`)))
  }
  const ocrText = results.map((r) => tidyRawText(r.lines)).filter(Boolean).join('\n\n') || null
  const block = extractIngredientBlock(results.flatMap((r) => r.lines))
  const ctx: CheckContext = {
    code,
    from,
    fileCount: input.files.length,
    ocrText,
    photoList: block ? listOf('foto', block.text, { quality: block.trusted ? 'gut' : 'unsicher' }) : null,
    photoCompany: ocrText ? extractCompany(ocrText) : null,
    websites: extractWebsites(ocrText ?? ''),
    hints: block?.hints ?? [],
    existing: null,
    external: null,
    offError: false,
    searched: false,
    manufacturer: null,
  }
  set('foto', 'fertig', reportPhoto(ctx).summary)

  // ---- 3. Open Food Facts und 4. eigene Datenbank (liefern auch Name und Marke für die Suche auf der Herstellerseite)
  set('openfoodfacts', 'läuft', 'Abrufen …')
  set('datenbank', 'läuft', 'Abgleichen …')
  for (const c of code ? [code] : eanCandidatesFromText(ocrText ?? '').slice(0, 4)) {
    const [ex, ext] = await Promise.all([
      deps.getByBarcode(c).catch(() => null),
      deps.lookupOpenFoodFacts(c).catch(() => {
        ctx.offError = true
        return null
      }),
    ])
    // Aus den gedruckten Ziffern geratene Nummern zählen nur, wenn eine Datenbank das Produkt kennt
    if (code || ex || ext) {
      if (!code) {
        ctx.code = c
        from.barcode = 'Ziffern unter dem Strichcode'
      }
      ctx.existing = ex
      ctx.external = ext
      break
    }
  }
  set('openfoodfacts', 'fertig', reportOff(ctx).summary)
  set('datenbank', 'fertig', reportDb(ctx).summary)

  // ---- 2. Herstellerseite
  set('hersteller', 'läuft', 'Website durchsuchen …')
  const name = ctx.existing?.name ?? ctx.external?.name ?? null
  ctx.searched = Boolean(name || ctx.code || ctx.hints.length >= 3)
  if (ctx.searched)
    ctx.manufacturer = await deps.lookupManufacturer({
      name,
      brand: ctx.existing?.brand ?? ctx.external?.brand ?? ctx.external?.company ?? ctx.photoCompany,
      barcode: ctx.code,
      urls: [...(ctx.external?.link ? [ctx.external.link] : []), ...ctx.websites],
      hints: ctx.hints,
    })
  set('hersteller', 'fertig', reportMfr(ctx).summary)

  // ---- 5. Abgleich
  set('abgleich', 'läuft', 'Quellen vergleichen …')
  const draft = assembleDraft(ctx)
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
    searched: false,
    manufacturer: null,
    edit: true,
  })
}
