import { describe, expect, it } from 'vitest'
import {
  cleanLines,
  extractIngredientBlock,
  extractWebsites,
  type OcrLine,
  parseIngredients,
  tidyRawText,
} from './textClean'

/** "Reismehl(92) (91%),(76)" → OcrLine, so Testdaten aus echten Erkennungsläufen lesbar bleiben. */
const L = (s: string): OcrLine => ({
  words: s.split(/\s+(?=\S+\(\d+\)$|\S+\(\d+\)\s)/).flatMap((chunk) =>
    [...chunk.matchAll(/(\S+?)\((\d+)\)/g)].map((m) => ({ text: m[1], confidence: Number(m[2]) })),
  ),
})

// Echte Ausgabe für die Rückseite der Bamboo-Garden-Reisnudeln (zweispaltiges Etikett)
const NOODLES = [
  'Pan(75) Ta(69) Reis(74) NUDELN(43) \\(93)',
  'gitionelles(51) Pad(93) Thai(93) und(96) viele(95) wi(95) at)(83) N(46)',
  'Zutaten:(89)',
  'Zubereitu"?‘(0) in(38) Wasser(86) Reismehl(92) (91%),(76) Tapiokamap,(40)',
  'A(79) Reisnudeln(46) M0(26) ren(33) Speisesalz.(45)',
  'kochen,(72) 997(26) Wasser(7) Durchschnittliche(69) dt(25) Beemer(32)',
  'davon(36) gesättigte(92) Fettsäuren(89) 034](0)',
].map(L)

// Zutatenliste einzeln und aus der Nähe fotografiert
const CLOSEUP = [
  'Zutaten:(95)',
  'Reismehl(96) (91%),(93) Tapiokamehl,(91)',
  'Speisesalz.(94)',
  'Nährwerte(90) je(95) 100g(92)',
].map(L)

describe('cleanLines', () => {
  it('entfernt unsichere Wörter, Symbole und einzelne Störbuchstaben', () => {
    expect(cleanLines([L('A(79) Reisnudeln(46) M0(26) |(90) ren(33) Speisesalz.(45)')])).toEqual([])
    expect(cleanLines([L('Wasser(90) |(80) Hafer(95) 10%(92) \\(90) Rapsöl,(88)')])).toEqual([
      'Wasser Hafer 10% Rapsöl,',
    ])
  })
})

describe('extractIngredientBlock', () => {
  it('erkennt eine gut lesbare Zutatenliste als vertrauenswürdig', () => {
    const b = extractIngredientBlock(CLOSEUP)!
    expect(b.trusted).toBe(true)
    expect(b.text).toBe('Reismehl (91%), Tapiokamehl, Speisesalz.')
  })

  it('stoppt vor der Nährwerttabelle', () => {
    expect(extractIngredientBlock(CLOSEUP)!.text).not.toMatch(/nährwert/i)
  })

  it('markiert den vermischten Spaltentext als nicht vertrauenswürdig', () => {
    const b = extractIngredientBlock(NOODLES)!
    expect(b.trusted).toBe(false)
    expect(b.quality).toBeLessThan(0.5)
    // Gezeigt werden nur sicher gelesene Wörter – kein Buchstabensalat wie „ochen n Durchschaittliche“
    expect(b.text).toBe('Wasser Reismehl (91%),')
  })

  it('erkennt die Nährwerttabelle auch bei verschriebenen Wörtern als Ende', () => {
    const b = extractIngredientBlock([
      'Zutaten:(95)', 'Reismehl(96) (91%),(93) Tapiokamehl,(91)', 'Speisesalz.(94)',
      'Durchschaittliche(88) Werte(90)', 'davon(90) gesättigte(92) Fettsäuren(89)',
    ].map(L))!
    expect(b.text).toBe('Reismehl (91%), Tapiokamehl, Speisesalz.')
    expect(b.hints).toEqual(['Reismehl', 'Tapiokamehl', 'Speisesalz'])
  })

  it('verlorene Wörter machen die Liste unsicher: 2 von 8 Wörtern unsicher → nicht vertrauenswürdig', () => {
    const b = extractIngredientBlock([
      'Zutaten:(95)', 'Reismehl(40) (91%),(90) Tapiokamehl,(35)', 'Speisesalz(92) und(95) Wasser,(94) Zucker(93)',
    ].map(L))!
    expect(b.quality).toBeCloseTo(0.75)
    expect(b.trusted).toBe(false)
  })

  it('liefert null ohne Zutatenüberschrift', () => {
    expect(extractIngredientBlock([L('Nährwerte(90) je(95) 100g(92)')])).toBeNull()
  })
})

describe('parseIngredients', () => {
  it('trennt Zutaten an Kommas außerhalb von Klammern', () => {
    const { items } = parseIngredients('Wasser, Hafer 10 %, Säureregulator (Dikaliumphosphat, E340), Salz.')
    expect(items).toEqual(['Wasser', 'Hafer 10 %', 'Säureregulator (Dikaliumphosphat, E340)', 'Salz'])
  })

  it('löst Spurenhinweise heraus', () => {
    const r = parseIngredients('Zutaten: Reis, Salz. Kann Spuren von Sellerie und Senf enthalten.')
    expect(r.items).toEqual(['Reis', 'Salz'])
    expect(r.traces).toEqual(['Kann Spuren von Sellerie und Senf enthalten.'])
  })

  it('trennt Fußnoten hinter der Liste ab und löst angeklebte Fußnotenziffern', () => {
    const r = parseIngredients('Glukosesirup, Zucker, 8% Kakaopulver1, Speisesalz. 1 Rainforest Alliance-zertifiziert')
    expect(r.items).toEqual(['Glukosesirup', 'Zucker', '8% Kakaopulver', 'Speisesalz'])
    expect(r.rest).toBe('1 Rainforest Alliance-zertifiziert')
  })

  it('lässt Dezimalzahlen, Klammern und Vitamin B12 unberührt', () => {
    const r = parseIngredients('Hafer 2.5 %, Vitamine (D2, B12), Salz.')
    expect(r.items).toEqual(['Hafer 2.5 %', 'Vitamine (D2, B12)', 'Salz'])
    expect(r.rest).toBeNull()
  })

  it('fügt Silbentrennung am Zeilenende zusammen', () => {
    expect(parseIngredients('Wei-\nzenmehl, Zucker').items[0]).toBe('Weizenmehl')
  })
})

describe('extractWebsites', () => {
  it('findet Webadressen im Rauschen, aber keine E-Mail-Adressen', () => {
    const text = 'D-49198 Dissen 4 "023900545644 ‘www.bamboogarden.de | info@edeka.de www.edeka.de/siegel'
    expect(extractWebsites(text)).toEqual(['https://www.bamboogarden.de', 'https://www.edeka.de/siegel'])
  })

  it('ignoriert Siegel-Organisationen', () => {
    expect(extractWebsites('Mehr unter www.ra.org und www.gruener-punkt.de')).toEqual([])
  })
})

describe('tidyRawText', () => {
  it('behält alle Wörter, entfernt nur Symbolmüll', () => {
    expect(tidyRawText([L('Weizen(30) |(90) mehl(20)'), L('|(50)')])).toBe('Weizen mehl')
  })
})
