import { useRef, useState } from 'react'
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
  /** Fotos der letzten Prüfung – damit weitere Fotos zu denselben hinzukommen können */
  const used = useRef<File[]>([])
  const busy = steps !== null
  const canStart = !busy && (files.length > 0 || barcode.trim().length > 0)

  async function run(input: { files: File[]; barcode: string; name?: string | null; brand?: string | null }) {
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
        input,
        setSteps,
      )
      used.current = input.files
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

  /** Prüft Fotos und Barcode über alle Quellen (siehe runCheck). Tut nichts ohne Eingabe. */
  async function start() {
    if (!canStart) return
    await run({ files, barcode })
  }

  /** Barcode live erkannt: sofort mit den vorhandenen Fotos prüfen. */
  async function startWithBarcode(code: string) {
    if (busy) return
    await run({ files, barcode: code })
  }

  /** Prüft noch einmal mit den bisherigen Fotos plus weiteren (bereits gelesene Fotos werden nicht neu gelesen). */
  async function addPhotos(more: File[], carry: { barcode: string | null; name: string | null; brand: string | null }) {
    if (busy || more.length === 0) return
    await run({ files: [...used.current, ...more], barcode: carry.barcode ?? '', name: carry.name, brand: carry.brand })
  }

  return { files, setFiles, barcode, setBarcode, steps, error, busy, canStart, start, startWithBarcode, addPhotos }
}
