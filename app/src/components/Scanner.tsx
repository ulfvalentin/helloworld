import { useState } from 'react'
import { eanCandidatesFromText } from '../lib/ean'
import { lookupOpenFoodFacts } from '../lib/openFoodFacts'
import { repository } from '../lib/repository'
import type { Product, ProductInput } from '../types'

export interface Draft {
  input: ProductInput
  existing: Product | null
  ocrText: string | null
  sources: string[]
}

const EMPTY: ProductInput = {
  barcode: null,
  name: null,
  brand: null,
  ingredients_text: null,
  label_text: null,
  certified_label: false,
  certification_note: null,
  external_tags: [],
  image_url: null,
}

export function Scanner({ onDraft }: { onDraft: (d: Draft) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [barcode, setBarcode] = useState('')
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function analyze() {
    setError(null)
    try {
      // Texterkennung und Barcode-Leser sind groß – erst bei Bedarf laden.
      const [{ decodeBarcode }, { extractIngredients, recognizeText }] = await Promise.all([
        import('../lib/barcode'),
        import('../lib/ocr'),
      ])
      // 1) Barcode aus Fotos lesen (falls nicht eingetippt)
      let code = barcode.trim() || null
      for (const f of files) {
        if (code) break
        setStep('Suche Barcode …')
        code = await decodeBarcode(f)
      }

      // 2) Text auf den Fotos entziffern
      const texts: string[] = []
      for (const [i, f] of files.entries()) {
        setStep(`Lese Text auf Foto ${i + 1}/${files.length} …`)
        texts.push(
          await recognizeText(f, (p) =>
            setStep(`Lese Text auf Foto ${i + 1}/${files.length} … ${Math.round(p * 100)} %`),
          ),
        )
      }
      const ocrText = texts.join('\n\n').trim() || null

      // 3) Abgleich mit eigener Datenbank und Open Food Facts
      const sources: string[] = []
      let existing: Product | null = null
      let external = null
      // War der Strichcode nicht lesbar, die gedruckten Ziffern aus dem Text versuchen.
      // Solche Kandidaten zählen nur, wenn eine Datenbank das Produkt kennt.
      const fromText = !code && ocrText ? eanCandidatesFromText(ocrText).slice(0, 4) : []
      for (const candidate of code ? [code] : fromText) {
        setStep('Gleiche mit Datenbanken ab …')
        existing = await repository.getByBarcode(candidate)
        external = await lookupOpenFoodFacts(candidate).catch(() => null)
        if (code || existing || external) {
          code = candidate
          break
        }
      }
      if (existing) sources.push('Eigene Datenbank')
      if (external) sources.push('Open Food Facts')
      if (ocrText) sources.push('Foto (Texterkennung)')

      const ocrIngredients = ocrText ? extractIngredients(ocrText) : null
      const input: ProductInput = {
        ...EMPTY,
        ...(existing && stripProduct(existing)),
        barcode: code,
        name: existing?.name ?? external?.name ?? null,
        brand: existing?.brand ?? external?.brand ?? null,
        // Frisch fotografierte Zutaten haben Vorrang – Rezepturen ändern sich.
        ingredients_text: ocrIngredients ?? existing?.ingredients_text ?? external?.ingredientsText ?? null,
        label_text: ocrText ?? existing?.label_text ?? null,
        external_tags: external?.tags ?? existing?.external_tags ?? [],
        image_url: existing?.image_url ?? external?.imageUrl ?? null,
      }
      onDraft({ input, existing, ocrText, sources })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStep(null)
    }
  }

  return (
    <div className="card stack">
      <h2>Lebensmittel prüfen</h2>
      <p className="muted">
        Fotografiere Vorderseite (Logo), Zutatenliste und Barcode. Mehrere Fotos sind möglich.
      </p>
      <label className="photo-button">
        📷 Foto aufnehmen / auswählen
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
          hidden
        />
      </label>
      {files.length > 0 && (
        <div className="thumbs">
          {files.map((f, i) => (
            <figure key={i}>
              <img src={URL.createObjectURL(f)} alt={`Foto ${i + 1}`} />
              <button
                type="button"
                className="link"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                entfernen
              </button>
            </figure>
          ))}
        </div>
      )}
      <label>
        Barcode (optional, wird sonst aus dem Foto gelesen)
        <input
          inputMode="numeric"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
          placeholder="z. B. 4008400402222"
        />
      </label>
      <button className="primary" disabled={!!step || (!files.length && !barcode)} onClick={analyze}>
        {step ?? 'Prüfen'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export function stripProduct(p: Product): ProductInput {
  const { id: _i, created_at: _c, updated_at: _u, confirmations: _k, status: _s, status_reasons: _r, ...rest } = p
  return rest
}
