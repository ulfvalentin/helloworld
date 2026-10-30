import { describe, expect, it } from 'vitest'
import { compareLists, itemKey, sameItem } from './ingredientsCompare'
import { tagNames } from './tagLabels'

describe('sameItem', () => {
  it('ignoriert Klammern, Prozente, Groß-/Kleinschreibung und Endungen', () => {
    expect(sameItem('Reismehl (91%)', 'reismehl')).toBe(true)
    expect(sameItem('HAFER* 10%', 'Hafer')).toBe(true)
    expect(sameItem('Säureregulator (Dikaliumphosphat)', 'Säureregulator')).toBe(true)
    expect(sameItem('Kakaopulver', 'Kakaopulvers')).toBe(true)
  })
  it('toleriert Tippfehler der Texterkennung bei längeren Wörtern', () => {
    expect(sameItem('Taplokamehl', 'Tapiokamehl')).toBe(true)
    expect(sameItem('Speisesalz', 'Speisesalz.')).toBe(true)
  })
  it('hält verschiedene Zutaten auseinander', () => {
    expect(sameItem('Zucker', 'Salz')).toBe(false)
    expect(sameItem('Weizenmehl', 'Reismehl')).toBe(false)
    expect(itemKey('')).toBe('')
  })
})

describe('compareLists', () => {
  it('gleiche Listen: Ähnlichkeit 1', () => {
    const r = compareLists(['Reismehl (91%)', 'Tapiokamehl', 'Speisesalz'], ['Reismehl', 'Taplokamehl', 'Speisesalz'])
    expect(r.similarity).toBe(1)
    expect(r.onlyA).toEqual([])
    expect(r.onlyB).toEqual([])
  })
  it('nennt Unterschiede in beide Richtungen', () => {
    const r = compareLists(['Wasser', 'Hafer', 'Rapsöl', 'Salz'], ['Wasser', 'Hafer', 'Zichorienfaser', 'Salz'])
    expect(r.onlyA).toEqual(['Rapsöl'])
    expect(r.onlyB).toEqual(['Zichorienfaser'])
    expect(r.similarity).toBeCloseTo(3 / 5)
  })
  it('leere Listen sind gleich', () => {
    expect(compareLists([], []).similarity).toBe(1)
  })
})

describe('tagNames', () => {
  it('übersetzt bekannte Tags und formatiert unbekannte', () => {
    expect(tagNames(['allergens:en:gluten', 'allergens:en:soybeans', 'traces:en:sesame-seeds', 'allergens:en:foo-bar'], 'allergens')).toEqual(['Gluten', 'Soja', 'Foo bar'])
    expect(tagNames(['traces:en:sesame-seeds'], 'traces')).toEqual(['Sesam'])
  })
})
