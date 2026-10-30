import { describe, expect, it } from 'vitest'
import { chooseIngredients } from './ingredientSource'

const good = { text: 'Reis, Salz', quality: 0.95, trusted: true, hints: [] }
const bad = { text: 'Wasser Reismehl (91%),', quality: 0.3, trusted: false, hints: [] }

describe('chooseIngredients', () => {
  it('gut lesbares Foto hat Vorrang vor gespeicherten und externen Daten', () => {
    expect(chooseIngredients({ block: good, existing: 'alt', external: 'ext' })).toEqual({ text: 'Reis, Salz', source: 'foto', trusted: true })
  })
  it('schlechtes Foto: gespeicherter Eintrag, dann Open Food Facts', () => {
    expect(chooseIngredients({ block: bad, existing: 'alt', external: 'ext' }).source).toBe('datenbank')
    expect(chooseIngredients({ block: bad, existing: null, external: 'ext' })).toEqual({ text: 'ext', source: 'openfoodfacts', trusted: true })
  })
  it('mittelmäßiges Foto ohne Alternative bleibt als unsichere Notlösung', () => {
    const middling = { ...bad, quality: 0.6 }
    expect(chooseIngredients({ block: middling, existing: null, external: null })).toEqual({ text: bad.text, source: 'foto', trusted: false })
  })
  it('sehr schlechtes Foto liefert keine (falschen) Zutaten', () => {
    expect(chooseIngredients({ block: bad, existing: null, external: null })).toEqual({ text: null, source: 'foto', trusted: false })
  })
  it('ohne alles: keine Zutaten', () => {
    expect(chooseIngredients({ block: null, existing: null, external: null })).toEqual({ text: null, source: null, trusted: false })
  })
})
