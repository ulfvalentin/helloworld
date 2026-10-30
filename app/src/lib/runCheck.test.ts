import { describe, expect, it, vi } from 'vitest'
import { classify } from './classify'
import { type CheckDeps, type ProgressStep, runCheck } from './runCheck'
import type { OcrLine } from './textClean'
import type { Product } from '../types'

/** "Reismehl(96) (91%),(93)" → OcrLine */
const L = (s: string): OcrLine => ({
  words: [...s.matchAll(/(\S+?)\((\d+)\)/g)].map((m) => ({ text: m[1], confidence: Number(m[2]) })),
})
const ocr = (...lines: string[]) => ({ text: '', lines: lines.map(L) })

const GOOD_PHOTO = ocr(
  'Zutaten:(95)',
  'Reismehl(96) (91%),(93) Tapiokamehl,(91)',
  'Speisesalz.(94)',
  'Theodor(95) Kattus(94) GmbH(93)',
)
// zweispaltiges Etikett, Zutaten nicht verlässlich lesbar
const BAD_PHOTO = ocr(
  'Zutaten:(89)',
  'Zubereitu"?(0) in(38) Wasser(86) Reismehl(92) (91%),(76) Tapiokamap,(40)',
  'A(79) Reisnudeln(46) M0(26) ren(33) Speisesalz.(45)',
  'Theodor(93) Kattus(92) GmbH(84)',
  'www.bamboogarden.de(80)',
)

const offProduct = (over: Record<string, unknown> = {}) => ({
  source: 'openfoodfacts' as const,
  barcode: '4023900545644',
  name: 'Pad Thai Reisnudeln',
  brand: 'Bamboo Garden',
  company: null,
  ingredientsText: 'Reismehl (91%), Tapiokamehl, Speisesalz',
  imageUrl: null,
  link: null,
  tags: ['labels:en:gluten-free', 'traces:en:sesame-seeds'],
  ...over,
})

const manufacturer = (over: Record<string, unknown> = {}) => ({
  found: true,
  sourceUrl: 'https://hersteller.de/pad-thai',
  title: 'Pad Thai Reisnudel Sticks',
  ingredients: 'Reismehl (91%), Tapiokamehl, Speisesalz',
  glutenStatements: ['glutenfrei'],
  allergens: null,
  exact: true,
  message: 'Zutaten auf der Hersteller-Website gefunden.',
  ...over,
})

function deps(over: Partial<CheckDeps> = {}): CheckDeps {
  return {
    decodeBarcode: vi.fn().mockResolvedValue('4023900545644'),
    recognizeText: vi.fn().mockResolvedValue(GOOD_PHOTO),
    getByBarcode: vi.fn().mockResolvedValue(null),
    lookupOpenFoodFacts: vi.fn().mockResolvedValue(offProduct()),
    lookupManufacturer: vi.fn().mockResolvedValue(manufacturer()),
    ...over,
  }
}
const photo = [new Blob(['x'])]

describe('runCheck', () => {
  it('prüft immer alle vier Quellen und meldet jeden Schritt', async () => {
    const d = deps()
    const seen: ProgressStep[][] = []
    const draft = await runCheck(d, { files: photo, barcode: '' }, (s) => seen.push(s))
    expect(d.lookupOpenFoodFacts).toHaveBeenCalledWith('4023900545644')
    expect(d.getByBarcode).toHaveBeenCalled()
    expect(d.lookupManufacturer).toHaveBeenCalled() // auch bei gut lesbarem Foto
    expect(draft.check.steps.map((s) => s.source)).toEqual(['foto', 'hersteller', 'openfoodfacts', 'datenbank'])
    const last = seen[seen.length - 1]
    expect(last.map((s) => s.id)).toEqual(['foto', 'hersteller', 'openfoodfacts', 'datenbank', 'abgleich'])
    expect(last.every((s) => s.state === 'fertig')).toBe(true)
    expect(seen[0].every((s) => s.state === 'wartet')).toBe(true)
  })

  it('stimmen alle Quellen überein: Liste vom Foto, Abgleich „consistent“', async () => {
    const draft = await runCheck(deps(), { files: photo, barcode: '' })
    expect(draft.check.reconciliation.status).toBe('consistent')
    expect(draft.check.chosen).toBe('foto')
    expect(draft.input.ingredients_text).toBe('Reismehl (91%), Tapiokamehl, Speisesalz')
    expect(draft.ingredients.trusted).toBe(true)
    expect(draft.check.lists.map((l) => l.source)).toEqual(['foto', 'hersteller', 'openfoodfacts'])
  })

  it('füllt Produkt, Hersteller und Barcode aus allen Quellen', async () => {
    const draft = await runCheck(deps(), { files: photo, barcode: '' })
    expect(draft.input.name).toBe('Pad Thai Reisnudeln')
    expect(draft.input.brand).toBe('Bamboo Garden')
    expect(draft.input.barcode).toBe('4023900545644')
    expect(draft.check.identity).toMatchObject({
      name: 'Pad Thai Reisnudeln',
      brand: 'Bamboo Garden',
      company: 'Theodor Kattus GmbH',
      barcode: '4023900545644',
      from: { barcode: 'Foto', name: 'Open Food Facts', brand: 'Open Food Facts', company: 'Verpackung' },
    })
  })

  it('Produkt unbekannt in Open Food Facts: Hersteller aus der Firma auf der Verpackung, Name von der Hersteller-Website', async () => {
    const d = deps({ lookupOpenFoodFacts: vi.fn().mockResolvedValue(null) })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    expect(draft.input.brand).toBe('Theodor Kattus GmbH')
    expect(draft.input.name).toBe('Pad Thai Reisnudel Sticks')
    expect(draft.check.identity.from.name).toBe('Hersteller-Website')
    expect(draft.check.steps[2]).toMatchObject({ source: 'openfoodfacts', status: 'none' })
  })

  it('schlecht lesbares Foto: Zutaten kommen von der Hersteller-Website, das Foto bleibt als Rohtext', async () => {
    const d = deps({ recognizeText: vi.fn().mockResolvedValue(BAD_PHOTO), lookupOpenFoodFacts: vi.fn().mockResolvedValue(null) })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    expect(draft.check.chosen).toBe('hersteller')
    expect(draft.input.ingredients_text).toBe('Reismehl (91%), Tapiokamehl, Speisesalz')
    expect(draft.ingredients).toMatchObject({ source: 'hersteller', trusted: true, url: 'https://hersteller.de/pad-thai' })
    expect(draft.input.label_text).toMatch(/Reismehl/)
    expect(draft.check.notes.map((n) => n.text).join(' ')).toMatch(/schwer lesbar/)
    expect(d.lookupManufacturer).toHaveBeenCalledWith(expect.objectContaining({ urls: ['https://www.bamboogarden.de'] }))
  })

  it('unsicheres Foto ohne andere Quelle: Liste bleibt sichtbar, aber als unsicher gekennzeichnet', async () => {
    const d = deps({
      recognizeText: vi.fn().mockResolvedValue(BAD_PHOTO),
      lookupOpenFoodFacts: vi.fn().mockResolvedValue(null),
      lookupManufacturer: vi.fn().mockResolvedValue({ ...manufacturer(), found: false, ingredients: null, message: 'nichts' }),
    })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    expect(draft.check.chosen).toBe('foto')
    expect(draft.ingredients.trusted).toBe(false)
    expect(draft.input.ingredients_text).toMatch(/Reismehl/)
    expect(draft.check.steps[1]).toMatchObject({ source: 'hersteller', status: 'none', summary: 'nichts' })
  })

  it('Quellen widersprechen sich bei Gluten: Warnung, und die Einstufung beachtet die Quelle mit Weizen', async () => {
    const d = deps({ lookupOpenFoodFacts: vi.fn().mockResolvedValue(offProduct({ ingredientsText: 'Weizenmehl, Speisesalz', tags: [] })) })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    const warn = draft.check.notes.filter((n) => n.level === 'warn').map((n) => n.text).join(' ')
    expect(warn).toMatch(/Open Food Facts nennt Weizen/)
    expect(draft.check.reconciliation.status).toBe('differs')
    expect(draft.input.label_text).toMatch(/Quelle Open Food Facts: Weizenmehl, Speisesalz/)
    const r = classify({ ingredientsText: draft.input.ingredients_text, labelText: draft.input.label_text, now: new Date('2026-10-29') })
    expect(r.status).toBe('contains_gluten')
    expect(r.glutenFindings).toContainEqual({ word: 'Weizenmehl', cereal: 'Weizen', where: 'quelle', source: 'Open Food Facts' })
    expect(r.reasons.join(' ')).toMatch(/Laut Open Food Facts stehen glutenhaltige Zutaten/)
  })

  it('vergleicht mit der eigenen Datenbank und meldet eine geänderte Rezeptur', async () => {
    const stored = { id: '1', name: 'Pad Thai', brand: 'BG', barcode: '4023900545644', ingredients_text: 'Reismehl, Maisstärke, Speisesalz', label_text: null, certified_label: false, certification_note: null, external_tags: [], image_url: null, status: 'unverified_gluten_free', status_reasons: [], created_at: '', updated_at: '', confirmations: [] } as Product
    const draft = await runCheck(deps({ getByBarcode: vi.fn().mockResolvedValue(stored) }), { files: photo, barcode: '' })
    expect(draft.existing?.id).toBe('1')
    expect(draft.check.steps[3]).toMatchObject({ source: 'datenbank', status: 'found' })
    expect(draft.check.notes.map((n) => n.text).join(' ')).toMatch(/eure Datenbank weicht ab/)
    expect(draft.check.identity.from.brand).toBe('eure Datenbank')
  })

  it('nur Barcode eingegeben: ohne Foto trotzdem alle Quellen', async () => {
    const d = deps()
    const draft = await runCheck(d, { files: [], barcode: '4023900545644' })
    expect(d.recognizeText).not.toHaveBeenCalled()
    expect(draft.check.steps[0]).toMatchObject({ source: 'foto', status: 'skipped' })
    expect(draft.check.chosen).toBe('hersteller')
    expect(draft.check.identity.from.barcode).toBe('eingetippt')
  })

  it('Fehler einer Quelle stoppt die Prüfung nicht und wird benannt', async () => {
    const d = deps({ lookupOpenFoodFacts: vi.fn().mockRejectedValue(new Error('offline')), lookupManufacturer: vi.fn().mockResolvedValue(null) })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    expect(draft.check.steps[2]).toMatchObject({ source: 'openfoodfacts', status: 'error' })
    expect(draft.check.steps[1]).toMatchObject({ source: 'hersteller', status: 'error' })
    expect(draft.check.chosen).toBe('foto')
  })

  it('nichts gefunden: keine Zutaten, aber ein Ergebnis', async () => {
    const d = deps({
      decodeBarcode: vi.fn().mockResolvedValue(null),
      recognizeText: vi.fn().mockResolvedValue(ocr('Hallo(95) Welt(94)')),
      lookupOpenFoodFacts: vi.fn().mockResolvedValue(null),
    })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    expect(draft.check.chosen).toBeNull()
    expect(draft.check.reconciliation.status).toBe('none')
    expect(draft.input.ingredients_text).toBeNull()
    expect(draft.check.steps[1]).toMatchObject({ source: 'hersteller', status: 'skipped' })
  })
})
