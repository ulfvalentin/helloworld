import { useMemo, useState } from 'react'
import { classify } from '../lib/classify'
import { repository } from '../lib/repository'
import type { Product, ProductInput } from '../types'
import { Reasons } from './ProductDetail'
import type { Draft } from './Scanner'
import { StatusBadge } from './StatusBadge'

/** Ergebnis prüfen, korrigieren und in die gemeinsame Datenbank übernehmen. */
export function ProductEditor({
  draft,
  onSaved,
  onCancel,
}: {
  draft: Draft
  onSaved: (p: Product) => void
  onCancel: () => void
}) {
  const [input, setInput] = useState<ProductInput>(draft.input)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const result = useMemo(
    () =>
      classify({
        ingredientsText: input.ingredients_text,
        labelText: input.label_text,
        certifiedLabel: input.certified_label,
        externalTags: input.external_tags,
        confirmations: draft.existing?.confirmations,
      }),
    [input, draft.existing],
  )
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }))

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const product = await repository.saveProduct(input, draft.existing?.id)
      await repository.recordScan(product.id, draft.ocrText)
      onSaved(product)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      <div className="card result">
        <StatusBadge status={result.status} large />
        <Reasons reasons={result.reasons} />
        {draft.sources.length > 0 && <p className="muted small">Quellen: {draft.sources.join(', ')}</p>}
      </div>

      <div className="card stack">
        <h3>Angaben prüfen &amp; ergänzen</h3>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={input.certified_label}
            onChange={(e) => set('certified_label', e.target.checked)}
          />
          <span>
            <strong>Zertifizierungslogo auf der Packung</strong> (durchgestrichene Ähre mit Lizenznummer,
            z. B. „DE-020-012“)
          </span>
        </label>
        {input.certified_label && (
          <label>
            Lizenznummer / Notiz zum Logo
            <input
              value={input.certification_note ?? ''}
              onChange={(e) => set('certification_note', e.target.value || null)}
            />
          </label>
        )}
        <div className="row">
          <label>
            Produkt
            <input value={input.name ?? ''} onChange={(e) => set('name', e.target.value || null)} />
          </label>
          <label>
            Marke
            <input value={input.brand ?? ''} onChange={(e) => set('brand', e.target.value || null)} />
          </label>
        </div>
        <label>
          Barcode
          <input
            inputMode="numeric"
            value={input.barcode ?? ''}
            onChange={(e) => set('barcode', e.target.value.replace(/\D/g, '') || null)}
          />
        </label>
        <label>
          Zutaten (inkl. „Kann Spuren von …“)
          <textarea
            rows={5}
            value={input.ingredients_text ?? ''}
            onChange={(e) => set('ingredients_text', e.target.value || null)}
          />
        </label>
        <label>
          Weiterer Verpackungstext (erkannt)
          <textarea
            rows={3}
            value={input.label_text ?? ''}
            onChange={(e) => set('label_text', e.target.value || null)}
          />
        </label>
        {input.external_tags.length > 0 && (
          <p className="muted small">Open Food Facts: {input.external_tags.join(', ')}</p>
        )}
        <div className="row">
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'Speichere …' : draft.existing ? 'Aktualisieren' : 'In Datenbank speichern'}
          </button>
          <button onClick={onCancel}>Abbrechen</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
