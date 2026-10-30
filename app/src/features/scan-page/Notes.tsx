import { InfoIcon, TriangleAlertIcon } from '../../components/icons'
import type { CheckNote } from '../../types'

/** Hinweise aus dem Abgleich: Unterschiede zwischen den Quellen, Spuren, Allergene, Aussagen. */
export function Notes({ notes }: { notes: CheckNote[] }) {
  return (
    <section className="card stack" aria-label="Hinweise">
      <h3>Hinweise</h3>
      {notes.length === 0 ? (
        <p className="muted">Keine besonderen Hinweise.</p>
      ) : (
        <ul className="notes">
          {notes.map((n, i) => (
            <li key={i} className={n.level === 'warn' ? 'note-warn' : undefined}>
              {n.level === 'warn' ? <TriangleAlertIcon className="icon-orange" /> : <InfoIcon />}
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
