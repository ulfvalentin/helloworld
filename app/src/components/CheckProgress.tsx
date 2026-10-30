import { useEffect, useRef } from 'react'
import type { ProgressStep } from '../lib/runCheck'
import { CheckIcon, LoaderIcon, MinusIcon } from './icons'

/** Live-Fortschritt der Prüfschritte auf dem Scan-Bildschirm. */
export function CheckProgress({ steps }: { steps: ProgressStep[] }) {
  // Die Liste steht oft unterhalb des sichtbaren Bereichs – beim Start ins Bild holen
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [])
  return (
    <div className="check-progress" role="status" aria-live="polite" ref={ref}>
      <p className="muted small">
        Schritt {Math.min(steps.filter((s) => s.state === 'fertig').length + 1, steps.length)} von {steps.length}
      </p>
      <div className="segments" aria-hidden="true">
        {steps.map((s) => (
          <span key={s.id} className={s.state === 'wartet' ? '' : 'on'} />
        ))}
      </div>
      <h3>Prüfung läuft</h3>
      <ol className="check-list">
        {steps.map((s, i) => (
          <li key={s.id} className={`step-${s.state}`}>
            {s.state === 'fertig' ? <CheckIcon /> : s.state === 'läuft' ? <LoaderIcon className="spin" /> : <MinusIcon />}
            <span>
              <strong>
                {i + 1}. {s.label}
              </strong>
              {s.detail && s.state !== 'wartet' && <small>{s.detail}</small>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
