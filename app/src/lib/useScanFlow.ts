import { useState } from 'react'
import { lookupManufacturer } from './manufacturer'
import { lookupOpenFoodFacts } from './openFoodFacts'
import { repository } from './repository'
import { type ProgressStep, STEP_LABELS, runCheck } from './runCheck'
import type { Draft } from '../types'

export { stripProduct } from './runCheck'

export type ScanFlow = ReturnType<typeof useScanFlow>

const INITIAL: ProgressStep[] = (['foto', 'hersteller', 'openfoodfacts', 'datenbank', 'abgleich'] as const).map((id, i) => ({
  id,
  label: STEP_LABELS[id],
  state: i === 0 ? 'läuft' : 'wartet',
}))

export function useScanFlow(onDraft: (d: Draft) => void) {
  const [files, setFiles] = useState<File[]>([])
  const [barcode, setBarcode] = useState('')
  /** Fortschritt der Prüfschritte; `null`, solange nicht geprüft wird */
  const [steps, setSteps] = useState<ProgressStep[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = steps !== null
  const canStart = !busy && (files.length > 0 || barcode.trim().length > 0)

  /** Prüft Fotos und Barcode über alle Quellen (siehe runCheck). Tut nichts ohne Eingabe. */
  async function start() {
    if (!canStart) return
    setError(null)
    setSteps(INITIAL)
    try {
      // Texterkennung und Barcode-Leser sind groß – erst bei Bedarf laden.
      const [{ decodeBarcode }, { recognizeText }] = await Promise.all([import('./barcode'), import('./ocr')])
      const draft = await runCheck(
        {
          decodeBarcode,
          recognizeText,
          getByBarcode: (code) => repository.getByBarcode(code),
          lookupOpenFoodFacts,
          lookupManufacturer,
        },
        { files, barcode },
        setSteps,
      )
      onDraft(draft)
      // Für die nächste Packung leeren (die Fotos stehen jetzt im Ergebnis)
      setFiles([])
      setBarcode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSteps(null)
    }
  }

  return { files, setFiles, barcode, setBarcode, steps, error, busy, canStart, start }
}
