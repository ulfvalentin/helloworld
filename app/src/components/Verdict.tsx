import { STATUS_META, type Classification } from '../lib/classify'
import type { GlutenStatus } from '../types'
import { CircleCheckIcon, CircleHelpIcon, ShieldCheckIcon, TriangleAlertIcon, WheatIcon } from './icons'

const STATUS_ICON: Record<GlutenStatus, typeof WheatIcon> = {
  verified_gluten_free: ShieldCheckIcon,
  unverified_gluten_free: CircleCheckIcon,
  may_contain_gluten: TriangleAlertIcon,
  contains_gluten: WheatIcon,
  unknown: CircleHelpIcon,
}

/**
 * Ergebnis der Einstufung: ein Hinweisfeld (bewusst kein Button: kein gefüllter Block, farbiger Streifen links)
 * und darunter die Begründung mit den gefundenen Wörtern.
 */
export function Verdict({ result }: { result: Classification }) {
  const meta = STATUS_META[result.status]
  const Icon = STATUS_ICON[result.status]
  return (
    <section className={`verdict verdict-${meta.tone}`} aria-label="Einstufung">
      <p className="verdict-head" role="status">
        <Icon className="verdict-icon" />
        <span>{meta.label}</span>
      </p>
      <div className="verdict-why">
        <h3>Warum?</h3>
        <ul>
          {result.explanation.map((item, i) => (
            <li key={i}>
              <span>{item.text}</span>
              {item.words && item.words.length > 0 && (
                <span className="found-words">
                  {item.words.map((w) => (
                    <b key={w.word} className="found">
                      {w.word}
                      {w.cereal.toLowerCase() !== w.word.toLowerCase() && <small> ({w.cereal})</small>}
                    </b>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
