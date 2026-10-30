import { describe, expect, it } from 'vitest'
import { classify, findGlutenSources, findTraceStatements, normalizeText } from './classify'

const now = new Date('2026-10-29T12:00:00Z')

describe('findGlutenSources', () => {
  const find = (t: string) => findGlutenSources(normalizeText(t))

  it('erkennt Weizen in Komposita', () => {
    expect(find('Vollkornweizenmehl, Zucker')).toContain('Weizen')
  })
  it('ignoriert Buchweizen', () => {
    expect(find('Buchweizenmehl, Reismehl')).toEqual([])
  })
  it('ignoriert Glukosesirup aus Weizen (LMIV-Ausnahme)', () => {
    expect(find('Zucker, Glukosesirup (aus Weizen), Salz')).toEqual([])
    expect(find('Weizenglukosesirup, Kakao')).toEqual([])
  })
  it('wertet Weizenmehl trotz Glukosesirup in anderer Zutat', () => {
    expect(find('Weizenmehl, Glukosesirup')).toContain('Weizen')
  })
  it('ignoriert "glutenfrei" und Negationen', () => {
    expect(find('Glutenfreie Haferflocken')).toEqual([])
    expect(find('Weizenstärke (glutenfrei), Mais')).toEqual([])
    expect(find('Ohne Weizen. Frei von Gluten.')).toEqual([])
  })
  it('verwechselt Maltodextrin nicht mit Malz', () => {
    expect(find('Maltodextrin, Maltose')).toEqual([])
    expect(find('Gerstenmalzextrakt')).toContain('Gerste')
  })
  it('trennt Silben am Zeilenende', () => {
    expect(find('Wei-\nzenmehl')).toContain('Weizen')
  })
})

describe('findTraceStatements', () => {
  it('liest Spurenhinweise und entfernt sie aus dem Text', () => {
    const { statements, rest } = findTraceStatements(
      normalizeText('Zutaten: Reis, Salz. Kann Spuren von Sellerie und Senf enthalten.'),
    )
    expect(statements).toEqual(['sellerie und senf'])
    expect(rest).toContain('reis, salz')
  })
  it('erkennt Hinweise auf Verarbeitung im Betrieb', () => {
    const { statements } = findTraceStatements(
      normalizeText('Reis. Hergestellt in einem Betrieb, der auch Weizen verarbeitet.'),
    )
    expect(statements.join()).toContain('weizen')
  })
})

describe('classify', () => {
  it('Zertifizierungslogo → geprüft glutenfrei', () => {
    const r = classify({ ingredientsText: 'Maismehl, Salz', certifiedLabel: true, now })
    expect(r.status).toBe('verified_gluten_free')
  })

  it('Herstellerbestätigung jünger als 6 Monate → geprüft glutenfrei', () => {
    const r = classify({
      ingredientsText: 'Reis',
      confirmations: [{ confirmed_at: '2026-06-01', confirms_gluten_free: true }],
      now,
    })
    expect(r.status).toBe('verified_gluten_free')
    expect(r.confirmationValidUntil).toBe('2026-12-01')
  })

  it('Herstellerbestätigung älter als 6 Monate zählt nicht mehr', () => {
    const r = classify({
      ingredientsText: 'Reis. Glutenfrei.',
      confirmations: [{ confirmed_at: '2026-04-28', confirms_gluten_free: true }],
      now,
    })
    expect(r.status).toBe('unverified_gluten_free')
    expect(r.reasons.join()).toMatch(/abgelaufen/)
  })

  it('Herstellerbestätigung am Tag genau 6 Monate alt ist noch gültig', () => {
    const r = classify({
      ingredientsText: 'Reis',
      confirmations: [{ confirmed_at: '2026-04-29', confirms_gluten_free: true }],
      now: new Date('2026-10-29T00:00:00Z'),
    })
    expect(r.status).toBe('verified_gluten_free')
  })

  it('Hersteller verneint → nicht geprüft glutenfrei', () => {
    const r = classify({
      ingredientsText: 'Reis. Glutenfrei.',
      confirmations: [
        { confirmed_at: '2026-05-01', confirms_gluten_free: true },
        { confirmed_at: '2026-09-01', confirms_gluten_free: false },
      ],
      now,
    })
    expect(r.status).toBe('may_contain_gluten')
  })

  it('"glutenfrei" ohne Logo → ungeprüft glutenfrei', () => {
    const r = classify({ ingredientsText: 'Reismehl, Maisstärke', labelText: 'Glutenfrei!', now })
    expect(r.status).toBe('unverified_gluten_free')
  })

  it('Spuren anderer Allergene, aber nicht Gluten → ungeprüft glutenfrei', () => {
    const r = classify({
      ingredientsText: 'Zutaten: Kartoffeln, Sonnenblumenöl, Salz. Kann Spuren von Sellerie enthalten.',
      now,
    })
    expect(r.status).toBe('unverified_gluten_free')
  })

  it('Spuren von Gluten → kann Gluten enthalten', () => {
    const r = classify({
      ingredientsText: 'Zutaten: Zucker, Kakaobutter, Milchpulver. Kann Spuren von Weizen und Nüssen enthalten.',
      now,
    })
    expect(r.status).toBe('may_contain_gluten')
    expect(r.glutenSources).toEqual([])
  })

  it('Weizen in der Zutatenliste → enthält Gluten', () => {
    const r = classify({ ingredientsText: 'Weizenmehl, Wasser, Hefe, Salz', now })
    expect(r.status).toBe('contains_gluten')
  })

  it('Hafer zählt als glutenhaltig', () => {
    expect(classify({ ingredientsText: 'Haferflocken', now }).status).toBe('contains_gluten')
  })

  it('keine Glutenzutaten, aber auch keine Angabe → nicht eingestuft', () => {
    expect(classify({ ingredientsText: 'Tomaten, Salz', now }).status).toBe('no_gluten_detected')
  })

  it('ohne Text → unbekannt', () => {
    expect(classify({ now }).status).toBe('unknown')
  })

  it('Open-Food-Facts-Tags werden genutzt', () => {
    expect(
      classify({ externalTags: ['labels:en:gluten-free'], ingredientsText: 'Reis', now }).status,
    ).toBe('unverified_gluten_free')
    expect(classify({ externalTags: ['traces:en:gluten'], ingredientsText: 'Reis', now }).status).toBe(
      'may_contain_gluten',
    )
    expect(classify({ externalTags: ['allergens:en:gluten'], now }).status).toBe('contains_gluten')
  })

  it('Lizenznummer im Text → Hinweis, aber erst nach Bestätigung geprüft', () => {
    const r = classify({ ingredientsText: 'Reis', labelText: 'DE-020-012 glutenfrei', now })
    expect(r.status).toBe('unverified_gluten_free')
    expect(r.reasons.join()).toMatch(/Logo/)
  })
})

describe('Beispielfotos (echte Texterkennung)', () => {
  it('Reisnudeln mit vermischten Spalten → keine Glutenzutaten', () => {
    // OCR-Ausgabe des Rückseitenfotos von Bamboo Garden Pad Thai Reisnudeln
    const ocr = `Pan Ta Reis NUDELN \\ gitionelles Pad Thai und viele wi at) N
Für traditio
Zutaten:
Zubereitu"?' in Wasser Reismehl (91%), Tapiokamap,
A Reisnudeln M0 ren Speisesalz.
kochen, 997 Wasser Durchschnittliche dt Beemer
Probieren Sie auch die So aka Trocken, wärme- und Glasnudeln und weitere lichtgeschützt lagern,`
    const r = classify({ ingredientsText: 'Zubereitu in Wasser Reismehl (91%), Tapiokamap, Speisesalz.', labelText: ocr, now })
    expect(r.status).toBe('no_gluten_detected')
  })

  it('Gluten außerhalb des erkannten Zutatenblocks wird trotzdem gefunden', () => {
    const r = classify({
      ingredientsText: 'Zucker, Kakao',
      labelText: 'Zutaten: Zucker, Kakao Zubereitung: rühren Weizenmehl, Salz',
      now,
    })
    expect(r.status).toBe('contains_gluten')
  })
})
