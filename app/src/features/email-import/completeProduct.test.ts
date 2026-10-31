import { describe, expect, it, vi } from 'vitest'
import type { Product } from '../../types'
import { completeFromManufacturer } from './completeProduct'

const product = (over: Partial<Product> = {}): Product =>
  ({ id: 'p1', barcode: null, name: 'Wan Kwai Ketjap Manis', brand: 'Importhaus Wilms', ingredients_text: null, label_text: null, certified_label: false, certification_note: null, image_url: null, status: 'unknown', status_reasons: [], created_at: '', updated_at: '2026-10-31T00:00:00Z', confirmations: [], ...over }) as Product

const mfr = (over = {}) => ({ found: true, sourceUrl: 'https://h.de/p', title: 'Ketjap', ingredients: 'Wasser, Zucker, Sojasauce, Salz', glutenStatements: [], allergens: null, imageUrl: 'https://h.de/p.jpg', exact: true, message: 'ok', ...over })

function run(existing: Product, m: unknown) {
  const saveProduct = vi.fn(async (input, id) => ({ ...existing, ...input, id }))
  const lookupManufacturer = vi.fn().mockResolvedValue(m)
  const res = completeFromManufacturer({ repository: { getById: async () => existing, saveProduct }, lookupManufacturer }, 'p1', ['https://www.hersteller.de'])
  return { res, saveProduct, lookupManufacturer }
}

describe('completeFromManufacturer', () => {
  it('ergänzt Zutaten und Foto von der Herstellerseite', async () => {
    const { res, saveProduct, lookupManufacturer } = run(product(), mfr())
    const r = await res
    expect(lookupManufacturer).toHaveBeenCalledWith(expect.objectContaining({ name: 'Wan Kwai Ketjap Manis', urls: ['https://www.hersteller.de'] }))
    expect(saveProduct).toHaveBeenCalledWith(expect.objectContaining({ ingredients_text: 'Wasser, Zucker, Sojasauce, Salz', image_url: 'https://h.de/p.jpg' }), 'p1')
    expect(r.notice).toBe('Zutaten und Foto von der Herstellerseite ergänzt.')
  })

  it('überschreibt vorhandene Angaben nicht', async () => {
    const { res, saveProduct } = run(product({ ingredients_text: 'Reis', image_url: 'https://x/y.jpg' }), mfr())
    const r = await res
    expect(saveProduct).not.toHaveBeenCalled()
    expect(r.notice).toMatch(/nichts Neues/)
  })

  it('nennt eine Händlerseite als Quelle', async () => {
    const { res } = run(product(), mfr({ source: 'haendler' }))
    expect((await res).notice).toBe('Zutaten und Foto von einer Händlerseite (bitte mit der Packung vergleichen) ergänzt.')
  })

  it('übernimmt nichts von einer nur ähnlichen Seite', async () => {
    const { res, saveProduct } = run(product(), mfr({ exact: false }))
    expect((await res).notice).toMatch(/ähnliches Produkt/)
    expect(saveProduct).not.toHaveBeenCalled()
  })

  it('meldet, wenn die Herstellerseite nicht erreichbar ist oder nichts liefert', async () => {
    expect((await run(product(), null).res).notice).toMatch(/nicht erreichbar/)
    expect((await run(product(), mfr({ found: false, message: 'keine Zutatenliste' })).res).notice).toMatch(/keine Zutatenliste/)
  })
})
