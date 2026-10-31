import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  brandSlug,
  extractAllergens,
  extractGlutenStatements,
  extractIngredients,
  findProductInfo,
  isIdentified,
  isPrivateAddress,
  nameTokens,
  extractImage,
  parsePage,
  pickBest,
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

  it('schneidet Lagerung und Zubereitung ab', () => {
    expect(extractIngredients('Zutaten: Reismehl, Salz Lagerung: trocken lagern Zubereitung: kochen')).toBe('Reismehl, Salz')
    expect(extractIngredients('Zutaten:\nReismehl, Salz\nTrocken lagern\nNährwerte')).toBe('Reismehl, Salz')
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
    expect(relevance(wrong, q)).toBeLessThan(2)
  })

  it('ein ähnliches Produkt, dem ein Zutatenwort fehlt, wird nicht übernommen (Hafercreme statt Haferdrink)', () => {
    const q2 = { brand: 'Oatly', urls: [], hints: ['Wasser', 'Hafer', 'Rapsöl', 'Säureregulator', 'Dikaliumphosphat'] }
    // echte Zutaten der Oatly Hafercreme: vier von fünf Wörtern passen, „Dikaliumphosphat“ fehlt
    const cream = page('Creamy Oat', 'Wasser, Rapsöl*, HAFER* 9%, Emulgator (Lecithine*), Säureregulator (Calciumcarbonat), Meersalz.')
    expect(relevance(cream, q2)).toBeLessThan(2)
    expect(pickBest([cream], q2).hit).toBeNull()
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

describe('pickBest', () => {
  const page = (url: string, ingredients: string) => ({
    url, title: 'Oat drink', h1: 'Oat drink', text: '', ingredients, glutenStatements: [], allergens: null, links: [],
  })
  const q = { brand: 'Oatly', urls: [], hints: ['Wasser', 'Hafer', 'Rapsöl', 'Säureregulator', 'Dikaliumphosphat'] }

  it('übernimmt den eindeutig besten Treffer', () => {
    const r = pickBest([page('a', 'Wasser, Hafer 10%, Rapsöl, Säureregulator (Dikaliumphosphat)'), page('b', 'Wasser, Hafer, Zucker')], q)
    expect(r.hit?.page.url).toBe('a')
    expect(r.ambiguous).toBe(false)
    expect(r.exact).toBe(false) // nur Zutatenwörter: ähnlich, aber nicht nachweislich dasselbe Produkt
  })

  it('verweigert bei gleich guten Treffern, die sich bei glutenrelevanten Zutaten unterscheiden', () => {
    const r = pickBest(
      [
        page('haferdrink', 'Wasser, Hafer 10%, Rapsöl, Säureregulator (Dikaliumphosphat), Calciumcarbonat'),
        page('mix', 'Wasser, Hafer 10%, Weizenmehl, Rapsöl, Säureregulator (Dikaliumphosphat)'),
      ],
      q,
    )
    expect(r.hit).toBeNull()
    expect(r.ambiguous).toBe(true)
  })

  it('übernimmt ähnliche Produkte mit gleichen glutenrelevanten Zutaten, aber nicht als exakt', () => {
    const r = pickBest(
      [
        page('haferdrink', 'Wasser, Hafer 10%, Rapsöl, Säureregulator (Dikaliumphosphat), Zichorienwurzelfaser'),
        page('barista', 'Wasser, Hafer 10%, Rapsöl, Säureregulator (Dikaliumphosphat), Gellan'),
      ],
      q,
    )
    expect(r.hit).not.toBeNull()
    expect(r.exact).toBe(false)
  })

  it('doppelte Seiten mit gleicher Zutatenliste sind nicht mehrdeutig', () => {
    const list = 'Wasser, Hafer 10%, Rapsöl, Säureregulator (Dikaliumphosphat)'
    expect(pickBest([page('a', list), page('b', list)], q).hit).not.toBeNull()
  })

  it('exakt nur bei Barcode- oder Namenstreffer', () => {
    const p = page('a', 'Wasser, Hafer 10%, Rapsöl, Säureregulator (Dikaliumphosphat)')
    expect(pickBest([p], { ...q, name: 'Oat drink' }).exact).toBe(true)
    expect(pickBest([p], { ...q, name: 'Hafercreme' }).exact).toBe(false)
    expect(isIdentified({ ...p, text: 'EAN 7394376623042' }, { ...q, barcode: '7394376623042' })).toBe(true)
  })

  it('ein Barcode-Treffer setzt sich gegen ähnliche Seiten durch', () => {
    const withCode = { ...page('code', 'Wasser, Hafer, Rapsöl, Säureregulator (Dikaliumphosphat), X'), text: 'EAN 7394376623042' }
    const r = pickBest([withCode, page('other', 'Wasser, Hafer, Rapsöl, Säureregulator (Dikaliumphosphat), Y')], { ...q, barcode: '7394376623042' })
    expect(r.hit?.page.url).toBe('code')
  })
})

describe('extractImage', () => {
  const page = 'https://hersteller.de/produkte/ketjap'
  it('bevorzugt das Produktbild aus schema.org', () => {
    const html = `<meta property="og:image" content="https://hersteller.de/og.jpg"><script type="application/ld+json">{"@type":"Product","image":["/img/ketjap.jpg"]}</script>`
    expect(extractImage(page, html)).toBe('https://hersteller.de/img/ketjap.jpg')
  })
  it('nimmt sonst og:image, aber keine Logos und kein http', () => {
    expect(extractImage(page, '<meta property="og:image" content="https://hersteller.de/ketjap.png">')).toBe('https://hersteller.de/ketjap.png')
    expect(extractImage(page, '<meta property="og:image" content="https://hersteller.de/assets/logo.png">')).toBeNull()
    expect(extractImage(page, '<meta property="og:image" content="http://hersteller.de/ketjap.png">')).toBeNull()
  })
})
