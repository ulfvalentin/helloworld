import type { ProgressStep } from '../lib/runCheck'
import { CheckIcon, LoaderIcon, MinusIcon } from './icons'

/** Live-Fortschritt der Prüfschritte auf dem Scan-Bildschirm. */
export function CheckProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="check-progress" role="status" aria-live="polite">
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
