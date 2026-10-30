import { CheckIcon, TriangleAlertIcon, XIcon } from '../../components/icons'
import { STEP_LABELS } from '../../lib/runCheck'
import type { CheckReport, StepReport } from '../../types'

// Jeder beendete Schritt bekommt ein Häkchen; das Ergebnis steht im Text. Nur ein Fehler zeigt ein X.
const ICON: Record<StepReport['status'], typeof CheckIcon> = {
  found: CheckIcon,
  none: CheckIcon,
  skipped: CheckIcon,
  error: XIcon,
}

/** „So wurde geprüft“: Ergebnis jeder Quelle und des Abgleichs. */
export function CheckSteps({ check }: { check: CheckReport }) {
  const r = check.reconciliation
  const ReconIcon = r.status === 'differs' ? TriangleAlertIcon : CheckIcon
  return (
    <details className="card check-steps" open>
      <summary>
        <h3>So wurde geprüft</h3>
      </summary>
      <ol className="check-list">
        {check.steps.map((s, i) => {
          const Icon = ICON[s.status]
          return (
            <li key={s.source} className={`result-${s.status}`}>
              <Icon />
              <span>
                <strong>
                  {i + 1}. {STEP_LABELS[s.source]}
                </strong>
                <small>
                  {s.summary}
                  {s.url && (
                    <>
                      {' '}
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        Seite öffnen
                      </a>
                    </>
                  )}
                </small>
              </span>
            </li>
          )
        })}
        <li className={r.status === 'differs' ? 'result-warn' : 'result-found'}>
          <ReconIcon />
          <span>
            <strong>{check.steps.length + 1}. {STEP_LABELS.abgleich}</strong>
            <small>{r.summary}</small>
          </span>
        </li>
      </ol>
    </details>
  )
}
