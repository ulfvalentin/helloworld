import { buildLabelText } from '../../lib/labelText'
import type { ManufacturerQuery, ManufacturerResult } from '../../lib/manufacturer'
import type { Repository } from '../../lib/repository'
import { listOf, stripProduct } from '../../lib/runCheck'
import type { Product } from '../../types'

export interface CompleteDeps {
  repository: Pick<Repository, 'getById' | 'saveProduct'>
  lookupManufacturer(q: ManufacturerQuery): Promise<ManufacturerResult | null>
}

/**
 * Sucht auf der Herstellerseite nach Zutaten und Produktfoto und ergänzt, was im Datenbankeintrag fehlt.
 * Vorhandene Angaben werden nie überschrieben. Zutaten und Foto kommen nur von einer Seite, die nachweislich
 * dasselbe Produkt zeigt (`exact`); bei ähnlichen Produkten wird nichts übernommen.
 * Liefert den Eintrag und einen Satz dazu, was passiert ist.
 */
export async function completeFromManufacturer(
  deps: CompleteDeps,
  productId: string,
  urls: string[] = [],
): Promise<{ product: Product | null; notice: string }> {
  const existing = await deps.repository.getById(productId)
  if (!existing) return { product: null, notice: '' }
  const found = await deps.lookupManufacturer({ name: existing.name, brand: existing.brand, barcode: existing.barcode, urls })
  if (!found) return { product: existing, notice: 'Die Herstellerseite war nicht erreichbar – Zutaten und Foto konnten nicht ergänzt werden.' }
  if (!found.found) return { product: existing, notice: `Herstellerseite: ${found.message}` }
  if (!found.exact)
    return { product: existing, notice: 'Auf der Herstellerseite steht nur ein ähnliches Produkt – es wurde nichts übernommen.' }

  const list = found.ingredients ? listOf('hersteller', found.ingredients) : null
  const added: string[] = []
  const next = stripProduct(existing)
  if (list && !existing.ingredients_text) {
    next.ingredients_text = list.text
    added.push('Zutaten')
  }
  if (found.imageUrl && !existing.image_url) {
    next.image_url = found.imageUrl
    added.push('Foto')
  }
  if (found.glutenStatements.length && !existing.label_text) {
    next.label_text = buildLabelText({ ocrText: null, lists: [], chosen: null, statements: found.glutenStatements })
  }
  if (added.length === 0 && next.label_text === existing.label_text)
    return { product: existing, notice: 'Auf der Herstellerseite gab es nichts Neues zu ergänzen.' }
  const product = await deps.repository.saveProduct(next, existing.id)
  return { product, notice: added.length ? `${added.join(' und ')} von der Herstellerseite ergänzt.` : 'Hinweise der Herstellerseite ergänzt.' }
}
