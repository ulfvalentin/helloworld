import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  brandSlug,
  extractAllergens,
  extractGlutenStatements,
  extractIngredients,
  findProductInfo,
  isPrivateAddress,
  nameTokens,
  parsePage,
  relevance,
} from './product-info'

describe('isPrivateAddress', () => {
  it('sperrt interne Adressen', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.0.10', '169.254.169.254', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '100.64.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })
  it('lässt öffentliche Adressen durch', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })
})

describe('findProductInfo – Sicherheit', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ruft nie interne oder Nicht-HTTP-Adressen ab', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await findProductInfo({
      name: 'Foo Bar',
      urls: ['http://127.0.0.1/', 'http://localhost:3000/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'file:///etc/passwd', 'https://user:pw@example.com/', 'http://example.com:8080/'],
    })
    expect(result.found).toBe(false)
    const called = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(called.filter((u) => /127\.0\.0\.1|localhost|169\.254|\[::1\]|^file:|user:pw|:8080/.test(u))).toEqual([])
  })

  it('verlangt Name, Barcode oder Zutatenwörter zum Suchen', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const result = await findProductInfo({ brand: 'Foo', urls: [] })
    expect(result.found).toBe(false)
    expect(result.message).toMatch(/fehlen/)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('extractIngredients', () => {
  it('liest eine Zutatenliste samt Überschrift-Wiederholung und stoppt vor dem Folgeabschnitt', () => {
    const text = 'Pad Thai\nZutatenliste\nZutaten: Glukosesirup, Zucker, Wasser, 8% fettarmes Kakaopulver, Speisesalz.\nNährwerte\nBrennwert 1779 kJ'
    expect(extractIngredients(text)).toBe('Glukosesirup, Zucker, Wasser, 8% fettarmes Kakaopulver, Speisesalz.')
  })

  it('schneidet angeklebte Seitenreste ab', () => {
    const text = 'Zutaten: Reismehl (91%), Tapiokamehl, Speisesalz Information Füllmenge: 0.3 kg Gebinde: 0.3 kg Beutel'
    expect(extractIngredients(text)).toBe('Reismehl (91%), Tapiokamehl, Speisesalz')
  })

  it('findet nichts ohne Zutatenüberschrift', () => {
    expect(extractIngredients('Unsere Nudeln sind lecker, bunt und gesund.')).toBeNull()
  })
})

describe('extractGlutenStatements / extractAllergens', () => {
  it('liefert Sätze mit „Gluten“ und kürzt Wirrwarr auf einen Ausschnitt', () => {
    const long = 'x'.repeat(150) + ' vegan glutenfrei ' + 'y'.repeat(150)
    const [s] = extractGlutenStatements(`Alle Produkte sind glutenfrei.\n${long}`)
    expect(extractGlutenStatements(`Alle Produkte sind glutenfrei.\n${long}`)).toContain('Alle Produkte sind glutenfrei.')
    expect(s.length).toBeLessThanOrEqual(120)
  })
  it('liest Allergenhinweise', () => {
    expect(extractAllergens('Allergene: Enthält Sellerie.\nAnderes')).toBe('Enthält Sellerie.')
  })
})

describe('Relevanz', () => {
  const page = (title: string, ingredients: string | null, text = '') => ({
    url: 'https://hersteller.de/produkt', title, h1: title, text, ingredients, glutenStatements: [], allergens: null, links: [],
  })

  it('Namenswörter ohne Marke', () => {
    expect(nameTokens('Bamboo Garden Pad Thai Reis Nudeln', 'Bamboo Garden')).toEqual(['pad', 'thai', 'reis', 'nudel'])
    expect(brandSlug('Bamboo Garden, Kattus')).toBe('bamboogarden')
  })

  it('passender Produktname in der Überschrift → relevant', () => {
    const q = { name: 'Pad Thai Reisnudeln', brand: 'Bamboo Garden', urls: [] }
    expect(relevance(page('Pad Thai Reisnudel Sticks', 'Reismehl'), q)).toBeGreaterThanOrEqual(2) // Singular/Plural
    expect(relevance(page('Pad Thai Reisnudeln 300 g', 'Reismehl'), q)).toBeGreaterThanOrEqual(2)
    expect(relevance(page('Udon Nudeln', 'Weizenmehl'), q)).toBeLessThan(2)
  })

  it('Barcode im Seitentext genügt', () => {
    expect(relevance(page('Irgendwas', 'Reis', 'EAN 4023900545644'), { barcode: '4023900545644', urls: [] })).toBeGreaterThanOrEqual(3)
  })

  it('Zutatenwörter vom Foto erkennen das Produkt ohne Namen', () => {
    const q = { brand: 'Oatly', urls: [], hints: ['Wasser', 'Hafer', 'Rapsöl', 'Säureregulator', 'Dikaliumphosphat'] }
    const right = page('Oat drink', 'Wasser, HAFER 10%, Rapsöl, Säureregulator (Dikaliumphosphat), Salz')
    const wrong = page('Oat drink choco', 'Wasser, Hafer, Zucker, Kakao')
    expect(relevance(right, q)).toBeGreaterThanOrEqual(2)
    expect(relevance(wrong, q)).toBeLessThan(2.5)
  })
})

describe('parsePage', () => {
  const html = `<html><head><title>Pad Thai &amp; mehr</title></head><body>
    <h1>Pad Thai Reisnudeln</h1><script>var zutaten = "nope";</script>
    <div>Zutaten:</div><div>Reismehl (91%), Tapiokamehl, Speisesalz</div><div>Nährwerte je 100 g</div>
    <p>Von Natur aus glutenfrei.</p>
    <a href="/produkte/udon">Udon</a><a href="/bild.jpg">Bild</a></body></html>`

  it('liest Titel, Zutaten, Gluten-Aussage und interne Links', () => {
    const p = parsePage('https://hersteller.de/start', html)
    expect(p.title).toBe('Pad Thai & mehr')
    expect(p.h1).toBe('Pad Thai Reisnudeln')
    expect(p.ingredients).toBe('Reismehl (91%), Tapiokamehl, Speisesalz')
    expect(p.glutenStatements).toEqual(['Von Natur aus glutenfrei.'])
    expect(p.links.map((l) => l.href)).toEqual(['https://hersteller.de/produkte/udon'])
  })
})
