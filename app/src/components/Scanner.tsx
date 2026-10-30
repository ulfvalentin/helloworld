import { useEffect, useState } from 'react'
import type { ScanFlow } from '../lib/useScanFlow'
import { CheckProgress } from './CheckProgress'
import { PhotoButtons } from './PhotoButtons'

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
    <div className="page stack">
      <h1>Was möchtest du prüfen?</h1>
      <p className="muted">
        Fotografiere Vorderseite, Zutatenliste und Barcode – danach unten auf „Prüfen“ tippen.
      </p>

      <PhotoButtons onPick={(picked) => setFiles((prev) => [...prev, ...picked])} disabled={busy} />

      {files.length > 0 && (
        <div className="thumbs">
          {files.map((f, i) => (
            <figure key={`${f.name}-${f.lastModified}-${i}`}>
              <img src={previews[i]} alt={`Foto ${i + 1}`} />
              <button
                type="button"
                className="text-button"
                aria-label={`Foto ${i + 1} entfernen`}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                disabled={busy}
              >
                Entfernen
              </button>
            </figure>
          ))}
        </div>
      )}

      <label>
        Barcode eintippen (optional)
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
