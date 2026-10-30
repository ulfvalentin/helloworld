import { useState } from 'react'
import { eanCandidatesFromText } from './ean'
import { chooseIngredients } from './ingredientSource'
import { applyManufacturer, lookupManufacturer } from './manufacturer'
import { lookupOpenFoodFacts } from './openFoodFacts'
import { repository } from './repository'
import { extractIngredientBlock, extractWebsites, tidyRawText } from './textClean'
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

export type ScanFlow = ReturnType<typeof useScanFlow>

export function useScanFlow(onDraft: (d: Draft) => void) {
  const [files, setFiles] = useState<File[]>([])
  const [barcode, setBarcode] = useState('')
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = step !== null
  const canStart = !busy && (files.length > 0 || barcode.trim().length > 0)

  /** Wertet die Fotos aus (Barcode, Text, Datenbanken, ggf. Hersteller-Website). Tut nichts ohne Eingabe. */
  async function start() {
    if (!canStart) return
    setError(null)
    setStep('Starte …')
    try {
      // Texterkennung und Barcode-Leser sind groß – erst bei Bedarf laden.
      const [{ decodeBarcode }, { recognizeText }] = await Promise.all([import('./barcode'), import('./ocr')])

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
            ingredients = { source: 'hersteller', trusted: true, url: found.sourceUrl, exact: found.exact, lookup: 'found', message: found.message }
            sources.push('Hersteller-Website')
          } else ingredients = { ...ingredients, lookup: 'not-found', message: found.message }
        }
      }
      onDraft({ input, existing, ocrText, sources, ingredients, websites, hints })
      // Für die nächste Packung leeren (die Fotos stehen jetzt im Ergebnis)
      setFiles([])
      setBarcode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStep(null)
    }
  }

  return { files, setFiles, barcode, setBarcode, step, error, busy, canStart, start }
}

export function stripProduct(p: Product): ProductInput {
  const { id: _i, created_at: _c, updated_at: _u, confirmations: _k, status: _s, status_reasons: _r, ...rest } = p
  return rest
}
