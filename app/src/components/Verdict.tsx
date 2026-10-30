import { STATUS_META, type Classification } from '../lib/classify'
import { XIcon } from './icons'
import { STATUS_ICON } from './statusIcons'

/**
 * Ergebnis-Banner (volle Breite, Farbe der Statusstufe, Symbolkreis, Urteil, eine Unterzeile) und darunter die
 * Beleg-Karte mit den gefundenen Wörtern. Das Urteil wird per aria-live angesagt.
 */
export function Verdict({ result, onClose }: { result: Classification; onClose?: () => void }) {
  const meta = STATUS_META[result.status]
  const Icon = STATUS_ICON[result.status]
  return (
    <>
      <section className={`banner tone-${meta.tone}`} aria-label="Einstufung">
        {onClose && (
          <button type="button" className="icon-button banner-close" aria-label="Schließen" onClick={onClose}>
            <XIcon size={22} />
          </button>
        )}
        <span className="banner-icon" aria-hidden="true">
          <Icon size={30} strokeWidth={2.6} />
        </span>
        <div role="status" aria-live="polite">
          <p className="verdict">{meta.label}</p>
          <p className="banner-sub">{meta.sub}</p>
        </div>
      </section>
      <section className="card evidence" aria-label="Begründung">
        <h3 className="label">Warum?</h3>
        <ul>
          {result.explanation.map((item, i) => (
            <li key={i}>
              <span>{item.text}</span>
              {item.words && item.words.length > 0 && (
                <span className="found-words">
                  {item.words.map((w) => (
                    <mark key={w.word} className={`tone-${meta.tone === 'safe' ? 'warn' : meta.tone}`}>
                      {w.word}
                      {w.cereal.toLowerCase() !== w.word.toLowerCase() && <small> ({w.cereal})</small>}
                    </mark>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
