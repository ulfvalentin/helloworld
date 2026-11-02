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
    lookupOpenFoodFacts: vi.fn().mockResolvedValue(null),
    lookupManufacturer: vi.fn().mockResolvedValue(manufacturer()),
    ...over,
  }
}
const photo = [new Blob(['x'])]
const step = (d: { check: { steps: { source: string; summary: string; status: string }[] } }, source: string) => d.check.steps.find((s) => s.source === source)

describe('runCheck', () => {
  it('prüft immer alle Quellen und meldet jeden Schritt', async () => {
    const d = deps()
    const seen: ProgressStep[][] = []
    const draft = await runCheck(d, { files: photo, barcode: '' }, (s) => seen.push(s))
    expect(d.getByBarcode).toHaveBeenCalled()
    expect(d.lookupManufacturer).toHaveBeenCalled() // auch bei gut lesbarem Foto
    expect(draft.check.steps.map((s) => s.source)).toEqual(['datenbank', 'foto', 'hersteller', 'openfoodfacts'])
    const last = seen[seen.length - 1]
    expect(last.map((s) => s.id)).toEqual(['datenbank', 'foto', 'hersteller', 'openfoodfacts', 'abgleich'])
    expect(last.every((s) => s.state === 'fertig')).toBe(true)
    expect(seen[0].every((s) => s.state === 'wartet')).toBe(true)
  })

  it('stimmen alle Quellen überein: Liste vom Foto, Abgleich „consistent“', async () => {
    const draft = await runCheck(deps(), { files: photo, barcode: '' })
    expect(draft.check.reconciliation.status).toBe('consistent')
    expect(draft.check.chosen).toBe('foto')
    expect(draft.input.ingredients_text).toBe('Reismehl (91%), Tapiokamehl, Speisesalz')
    expect(draft.ingredients.trusted).toBe(true)
    expect(draft.check.lists.map((l) => l.source)).toEqual(['foto', 'hersteller'])
  })

  it('füllt Produkt, Hersteller und Barcode aus Foto und Hersteller-Website', async () => {
    const draft = await runCheck(deps(), { files: photo, barcode: '' })
    expect(draft.input.brand).toBe('Theodor Kattus GmbH')
    expect(draft.input.name).toBe('Pad Thai Reisnudel Sticks')
    expect(draft.input.barcode).toBe('4023900545644')
    expect(draft.check.identity).toMatchObject({
      name: 'Pad Thai Reisnudel Sticks',
      company: 'Theodor Kattus GmbH',
      barcode: '4023900545644',
      from: { barcode: 'Foto', name: 'Hersteller-Website', company: 'Verpackung' },
    })
  })

  it('schlecht lesbares Foto: Zutaten kommen von der Hersteller-Website, das Foto bleibt als Rohtext', async () => {
    const d = deps({ recognizeText: vi.fn().mockResolvedValue(BAD_PHOTO) })
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
      lookupManufacturer: vi.fn().mockResolvedValue({ ...manufacturer(), found: false, ingredients: null, message: 'nichts' }),
    })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    expect(draft.check.chosen).toBe('foto')
    expect(draft.ingredients.trusted).toBe(false)
    expect(draft.input.ingredients_text).toMatch(/Reismehl/)
    expect(step(draft, 'hersteller')).toMatchObject({ source: 'hersteller', status: 'none', summary: 'nichts' })
  })

  it('Quellen widersprechen sich bei Gluten: Warnung, und die Einstufung ist unbekannt', async () => {
    const d = deps({ lookupManufacturer: vi.fn().mockResolvedValue(manufacturer({ ingredients: 'Weizenmehl, Speisesalz' })) })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    const warn = draft.check.notes.filter((n) => n.level === 'warn').map((n) => n.text).join(' ')
    expect(warn).toMatch(/Hersteller-Website nennt Weizen/)
    expect(draft.check.reconciliation.status).toBe('differs')
    expect(draft.input.label_text).toMatch(/Quelle Hersteller-Website: Weizenmehl, Speisesalz/)
    const r = classify({ ingredientsText: draft.input.ingredients_text, labelText: draft.input.label_text, now: new Date('2026-10-29') })
    expect(r.status).toBe('unknown')
    expect(r.glutenFindings).toContainEqual({ word: 'Weizenmehl', cereal: 'Weizen', where: 'quelle', source: 'Hersteller-Website' })
  })

  it('vergleicht mit der eigenen Datenbank und meldet eine geänderte Rezeptur', async () => {
    const stored = { id: '1', name: 'Pad Thai', brand: 'BG', barcode: '4023900545644', ingredients_text: 'Reismehl, Maisstärke, Speisesalz', label_text: null, certified_label: false, certification_note: null, image_url: null, status: 'unverified_gluten_free', status_reasons: [], created_at: '', updated_at: '', confirmations: [] } as Product
    const draft = await runCheck(deps({ getByBarcode: vi.fn().mockResolvedValue(stored) }), { files: photo, barcode: '' })
    expect(draft.existing?.id).toBe('1')
    expect(step(draft, 'datenbank')).toMatchObject({ source: 'datenbank', status: 'found' })
    expect(draft.check.notes.map((n) => n.text).join(' ')).toMatch(/eure Datenbank weicht ab/)
    expect(draft.check.identity.from.brand).toBe('eure Datenbank')
  })

  it('nur Barcode eingegeben: ohne Foto trotzdem alle Quellen', async () => {
    const d = deps()
    const draft = await runCheck(d, { files: [], barcode: '4023900545644' })
    expect(d.recognizeText).not.toHaveBeenCalled()
    expect(step(draft, 'foto')).toMatchObject({ source: 'foto', status: 'skipped' })
    expect(draft.check.chosen).toBe('hersteller')
    expect(draft.check.identity.from.barcode).toBe('eingetippt')
  })

  it('Fehler einer Quelle stoppt die Prüfung nicht und wird benannt', async () => {
    const d = deps({ getByBarcode: vi.fn().mockRejectedValue(new Error('offline')), lookupManufacturer: vi.fn().mockResolvedValue(null) })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    expect(step(draft, 'hersteller')).toMatchObject({ source: 'hersteller', status: 'error' })
    expect(draft.check.chosen).toBe('foto')
  })

  it('nichts gefunden: keine Zutaten, aber ein Ergebnis', async () => {
    const d = deps({
      decodeBarcode: vi.fn().mockResolvedValue(null),
      recognizeText: vi.fn().mockResolvedValue(ocr('Hallo(95) Welt(94)')),
    })
    const draft = await runCheck(d, { files: photo, barcode: '' })
    expect(draft.check.chosen).toBeNull()
    expect(draft.check.reconciliation.status).toBe('none')
    expect(draft.input.ingredients_text).toBeNull()
    expect(step(draft, 'hersteller')).toMatchObject({ source: 'hersteller', status: 'skipped' })
  })

  describe('neuer Ablauf: Barcode → Bild-KI → Hersteller → Open Food Facts', () => {
    const bresso = {
      source: 'openfoodfacts' as const,
      barcode: '4000400008053',
      name: 'Kräuter der Provence',
      brand: 'Bresso',
      company: null,
      ingredientsText: 'Frischkäse, Crème Fraiche, Butter, Kräuter der Provence, Kräuter, Stärke, Gewürze, Speisesalz, natürliche Aromen, Stickstoff zum Aufschlagen.',
      imageUrl: 'https://images.openfoodfacts.org/bresso.jpg',
      link: null,
      tags: ['allergens:en:milk', 'traces:en:celery'],
    }
    const reading = (over = {}) => ({
      product_name: 'Bresso mit Kräutern aus der Provence',
      brand: 'Bresso',
      manufacturer: 'Hochland Deutschland GmbH, Heimenkirch',
      barcode: '4000400008053',
      ingredients: 'FRISCHKÄSE, CRÈME FRAÎCHE, BUTTER, Kräuter der Provence, Kräuter, Stärke, Gewürze, Speisesalz, natürliche Aromen, Stickstoff zum Aufschlagen',
      traces: 'Kann Spuren von Sellerie enthalten.',
      ingredients_complete: true,
      unreadable: [],
      websites: ['bresso.de'],
      ...over,
    })
    const noMfr = vi.fn().mockResolvedValue({ ...manufacturer(), found: false, ingredients: null, message: 'nichts' })

    it('Barcode zuerst: Produkt laut Open Food Facts, danach Suche auf der Herstellerseite mit Marke + Name', async () => {
      const d = deps({ decodeBarcode: vi.fn().mockResolvedValue('4000400008053'), lookupOpenFoodFacts: vi.fn().mockResolvedValue(bresso), lookupManufacturer: noMfr })
      const draft = await runCheck(d, { files: photo, barcode: '' })
      expect(d.lookupOpenFoodFacts).toHaveBeenCalledWith('4000400008053')
      expect(draft.check.identity).toMatchObject({ name: 'Kräuter der Provence', brand: 'Bresso', from: { name: 'Open Food Facts', brand: 'Open Food Facts' } })
      expect(step(draft, 'datenbank')).toMatchObject({ status: 'found' })
      expect(step(draft, 'datenbank')!.summary).toMatch(/Bresso – Kräuter der Provence \(laut Open Food Facts\)/)
      expect(noMfr).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kräuter der Provence', brand: 'Bresso' }))
      const notes = draft.check.notes.map((n) => n.text).join(' ')
      expect(notes).toMatch(/Spuren laut Open Food Facts: Sellerie/)
    })

    it('Bild-KI liest die Zutaten; die Texterkennung im Browser läuft dann nicht', async () => {
      const readLabel = vi.fn().mockResolvedValue({ reading: reading() })
      const d = deps({ readLabel, decodeBarcode: vi.fn().mockResolvedValue('4000400008053'), lookupOpenFoodFacts: vi.fn().mockResolvedValue(bresso), lookupManufacturer: noMfr })
      const draft = await runCheck(d, { files: photo, barcode: '' })
      expect(d.recognizeText).not.toHaveBeenCalled()
      expect(draft.check.chosen).toBe('foto')
      expect(draft.ingredients.trusted).toBe(true)
      expect(draft.input.ingredients_text).toMatch(/^FRISCHKÄSE, CRÈME FRAÎCHE, BUTTER/)
      expect(draft.input.ingredients_text).toMatch(/Kann Spuren von Sellerie enthalten/)
      expect(step(draft, 'foto')!.summary).toMatch(/Bild-KI/)
      // Open Food Facts nennt dieselben Zutaten: wird verglichen, nicht gewählt
      expect(draft.check.lists.map((l) => l.source)).toContain('openfoodfacts')
      expect(draft.check.reconciliation.status).toBe('consistent')
    })

    it('Bild-KI nicht verfügbar: Texterkennung im Browser als Ersatz', async () => {
      const d = deps({ readLabel: vi.fn().mockResolvedValue({ reading: null, error: 'nicht eingerichtet' }) })
      const draft = await runCheck(d, { files: photo, barcode: '' })
      expect(d.recognizeText).toHaveBeenCalled()
      expect(step(draft, 'foto')!.summary).toMatch(/Texterkennung im Browser/)
    })

    it('unsicher gelesene Stellen: Liste unsicher, Warnhinweis', async () => {
      const d = deps({ readLabel: vi.fn().mockResolvedValue({ reading: reading({ ingredients_complete: false, unreadable: ['Wort nach „Stärke“'] }) }), lookupManufacturer: noMfr })
      const draft = await runCheck(d, { files: photo, barcode: '' })
      expect(draft.ingredients.trusted).toBe(false)
      expect(draft.check.notes.find((n) => n.level === 'warn')?.text).toMatch(/nicht sicher lesbar: Wort nach „Stärke“/)
    })

    it('Strichcode unscharf: die von der Bild-KI gelesenen Ziffern werden nachgeschlagen', async () => {
      const lookupOpenFoodFacts = vi.fn().mockResolvedValue(bresso)
      const d = deps({ decodeBarcode: vi.fn().mockResolvedValue(null), readLabel: vi.fn().mockResolvedValue({ reading: reading() }), lookupOpenFoodFacts, lookupManufacturer: noMfr })
      const draft = await runCheck(d, { files: photo, barcode: '' })
      expect(lookupOpenFoodFacts).toHaveBeenCalledWith('4000400008053')
      expect(draft.check.identity).toMatchObject({ barcode: '4000400008053', from: { barcode: 'Ziffern unter dem Strichcode' } })
    })

    it('ohne Foto-Zutaten und Herstellerseite: Zutaten laut Open Food Facts, gekennzeichnet', async () => {
      const d = deps({ lookupOpenFoodFacts: vi.fn().mockResolvedValue(bresso), lookupManufacturer: noMfr })
      const draft = await runCheck(d, { files: [], barcode: '4000400008053' })
      expect(draft.check.chosen).toBe('openfoodfacts')
      expect(draft.ingredients.source).toBe('openfoodfacts')
      expect(step(draft, 'openfoodfacts')).toMatchObject({ status: 'found' })
      expect(draft.input.image_url).toBe('https://images.openfoodfacts.org/bresso.jpg')
    })

    it('zweite Herstellerseite wird verglichen', async () => {
      const mfr = manufacturer({ alternative: { url: 'https://haendler.de/pad-thai', title: 'Pad Thai', ingredients: 'Reismehl (91%), Tapiokamehl, Speisesalz' } })
      const draft = await runCheck(deps({ lookupManufacturer: vi.fn().mockResolvedValue(mfr) }), { files: photo, barcode: '' })
      expect(draft.check.notes.map((n) => n.text).join(' ')).toMatch(/zweite Seite \(haendler\.de\) nennt dieselben Zutaten/)
      expect(draft.input.label_text).toMatch(/Quelle haendler\.de: Reismehl/)
    })
  })
})
