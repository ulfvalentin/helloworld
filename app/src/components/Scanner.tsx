import { useEffect, useState } from 'react'
import type { ScanFlow } from '../lib/useScanFlow'
import { CheckProgress } from './CheckProgress'
import { PhotoButtons } from './PhotoButtons'

const STEPS = [
  { title: 'Vorderseite fotografieren', hint: 'Produktname und Logo sollen zu sehen sein.' },
  { title: 'Zutatenliste fotografieren', hint: 'Einzeln, aus der Nähe, gerade und scharf.' },
  { title: 'Barcode fotografieren', hint: 'Ohne Spiegelung – oder unten eintippen.' },
  { title: 'Unten auf „Prüfen“ tippen', hint: null },
]

/** Scan-Bildschirm. Die Auswertung startet der „Prüfen“-Button in der unteren Leiste (siehe App). */
export function Scanner({ scan }: { scan: ScanFlow }) {
  const { files, setFiles, barcode, setBarcode, busy, steps, error } = scan

  // Texterkennung schon laden, während der Nutzer fotografiert (spart beim Prüfen ca. 5 s)
  useEffect(() => {
    void import('../lib/ocr').then((m) => m.warmUp())
  }, [])

  // Vorschaubilder erzeugen und wieder freigeben. Im Effekt statt in useMemo, weil React im Entwicklungsmodus
  // Effekte zweimal ausführt und freigegebene Adressen sonst weiter benutzt würden.
  const [previews, setPreviews] = useState<string[]>([])
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  return (
    <div className="card stack">
      <h2>Lebensmittel prüfen</h2>
      <ol className="steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <strong>{s.title}</strong>
            {s.hint && <span className="muted small">{s.hint}</span>}
          </li>
        ))}
      </ol>
      <p className="muted small">Mehrere Fotos sind möglich.</p>

      <PhotoButtons onPick={(picked) => setFiles((prev) => [...prev, ...picked])} disabled={busy} />

      {files.length > 0 && (
        <div className="thumbs">
          {files.map((f, i) => (
            <figure key={`${f.name}-${f.lastModified}-${i}`}>
              <img src={previews[i]} alt={`Foto ${i + 1}`} />
              <button type="button" className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))} disabled={busy}>
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
          disabled={busy}
        />
      </label>

      {steps && <CheckProgress steps={steps} />}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
