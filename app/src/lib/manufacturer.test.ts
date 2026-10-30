import { describe, expect, it } from 'vitest'
import { applyManufacturer, type ManufacturerResult } from './manufacturer'
import type { ProductInput } from '../types'

const base: ProductInput = {
  barcode: '1', name: null, brand: 'Oatly', ingredients_text: 'Wasser Kor Irate',
  label_text: 'Rohtext vom Foto', certified_label: false, certification_note: null, external_tags: [], image_url: null,
}
const found: ManufacturerResult = {
  found: true, sourceUrl: 'https://x.de/p', title: 'Haferdrink', ingredients: 'Wasser, Hafer 10 %',
  glutenStatements: ['Von Natur aus glutenfrei.'], allergens: null, message: '',
}

describe('applyManufacturer', () => {
  it('ersetzt unsichere Zutaten, ergänzt Aussagen, behält den Rohtext', () => {
    const r = applyManufacturer(base, found)
    expect(r.ingredients_text).toBe('Wasser, Hafer 10 %')
    expect(r.name).toBeNull() // Seitentitel sind oft Werbetexte – kein Produktname
    expect(r.label_text).toBe('Rohtext vom Foto\nHersteller-Website: Von Natur aus glutenfrei.')
  })
  it('dupliziert Aussagen bei erneuter Suche nicht', () => {
    const once = applyManufacturer(base, found)
    const twice = applyManufacturer(once, found)
    expect(twice.label_text).toBe(once.label_text)
  })
  it('lässt die Angaben bei erfolgloser Suche unverändert', () => {
    expect(applyManufacturer(base, { ...found, found: false, ingredients: null })).toBe(base)
  })
})
