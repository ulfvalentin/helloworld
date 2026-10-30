import { useState } from 'react'
import { eanCandidatesFromText } from '../lib/ean'
import { chooseIngredients } from '../lib/ingredientSource'
import { applyManufacturer, lookupManufacturer } from '../lib/manufacturer'
import { lookupOpenFoodFacts } from '../lib/openFoodFacts'
import { repository } from '../lib/repository'
import { extractIngredientBlock, extractWebsites, tidyRawText } from '../lib/textClean'
import type { Draft, IngredientInfo, Product, ProductInput } from '../types'

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
      const [{ decodeBarcode }, { recognizeText }] = await Promise.all([import('../lib/barcode'), import('../lib/ocr')])

      // 1) Barcode aus Fotos lesen (falls nicht eingetippt)
      let code = barcode.trim() || null
      for (const f of files) {
        if (code) break
        setStep('Suche Barcode …')
        code = await decodeBarcode(f)
      }

      // 2) Text auf den Fotos entziffern und aufräumen
      const results = []
      for (const [i, f] of files.entries()) {
        setStep(`Lese Text auf Foto ${i + 1}/${files.length} …`)
        results.push(
          await recognizeText(f, (p) =>
            setStep(`Lese Text auf Foto ${i + 1}/${files.length} … ${Math.round(p * 100)} %`),
          ),
        )
      }
      const lines = results.flatMap((r) => r.lines)
      const ocrText = results.map((r) => tidyRawText(r.lines)).filter(Boolean).join('\n\n') || null
      const block = extractIngredientBlock(lines)
      const websites = extractWebsites(ocrText ?? '')

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

      // 4) Welcher Zutatenliste ist zu trauen? Sonst auf der Hersteller-Website nachsehen.
      const choice = chooseIngredients({
        block,
        existing: existing?.ingredients_text ?? null,
        external: external?.ingredientsText ?? null,
      })
      let input: ProductInput = {
        ...EMPTY,
        ...(existing && stripProduct(existing)),
        barcode: code,
        name: existing?.name ?? external?.name ?? null,
        brand: existing?.brand ?? external?.brand ?? null,
        ingredients_text: choice.text,
        label_text: ocrText ?? existing?.label_text ?? null,
        external_tags: external?.tags ?? existing?.external_tags ?? [],
        image_url: existing?.image_url ?? external?.imageUrl ?? null,
      }
      const hints = block?.hints ?? []
      let ingredients: IngredientInfo = {
        source: choice.source,
        trusted: choice.trusted,
        url: null,
        lookup: 'skipped',
        message: null,
      }
      if (!choice.trusted) {
        const canSearch = Boolean(input.name || input.barcode || hints.length >= 3)
        if (canSearch) {
          setStep('Suche auf der Hersteller-Website …')
          const found = await lookupManufacturer({
            name: input.name,
            brand: input.brand,
            barcode: input.barcode,
            urls: [...(external?.link ? [external.link] : []), ...websites],
            hints,
          })
          if (!found) ingredients = { ...ingredients, lookup: 'unavailable' }
          else if (found.found && found.ingredients) {
            input = applyManufacturer(input, found)
            ingredients = { source: 'hersteller', trusted: true, url: found.sourceUrl, lookup: 'found', message: found.message }
            sources.push('Hersteller-Website')
          } else ingredients = { ...ingredients, lookup: 'not-found', message: found.message }
        }
      }
      onDraft({ input, existing, ocrText, sources, ingredients, websites, hints })
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
