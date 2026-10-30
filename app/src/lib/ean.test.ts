import { describe, expect, it } from 'vitest'
import { eanCandidatesFromText, isValidEan } from './ean'

describe('isValidEan', () => {
  it('prüft die Prüfziffer', () => {
    expect(isValidEan('4023900545644')).toBe(true)
    expect(isValidEan('4311501089002')).toBe(true)
    expect(isValidEan('4023900545645')).toBe(false)
    expect(isValidEan('371567029002')).toBe(false) // 12 Stellen (UPC-A) werden nicht akzeptiert
  })
})

describe('eanCandidatesFromText', () => {
  it('findet die EAN in verrauschtem OCR-Text', () => {
    // echte OCR-Ausgabe unter dem Barcode der Bamboo-Garden-Reisnudeln
    expect(eanCandidatesFromText('E D-49198 Dissen\n4 4 "023900545644 ‘www.bamboogarden.de')).toContain(
      '4023900545644',
    )
  })
  it('ignoriert Zahlen ohne gültige Prüfziffer', () => {
    expect(eanCandidatesFromText('Lot: 12012026 11.01.2028')).toEqual([])
  })
})
