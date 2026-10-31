import { useMemo, useState } from 'react'
import { CONFIRMATION_VALID_MONTHS, classify } from '../lib/classify'
import { formatDate, infoAge } from '../lib/infoAge'
import { repository } from '../lib/repository'
import type { ManufacturerConfirmation, Product } from '../types'
import { CheckIcon, TriangleAlertIcon, XIcon } from './icons'
import { Verdict } from './Verdict'

export function ProductDetail({
  product,
  onChange,
  onEdit,
  onBack,
  onRescan,
  notice,
}: {
  product: Product
  onChange: (p: Product) => void
  onEdit: () => void
  onBack: () => void
  /** Führt zum Scan-Bildschirm, um das Produkt neu zu prüfen */
  onRescan: () => void
  /** Hinweis nach dem Speichern (z. B. was von der Herstellerseite ergänzt wurde) */
  notice?: string | null
}) {
  // Begründung mit den gefundenen Wörtern aus den gespeicherten Angaben neu berechnen
  const result = useMemo(
    () =>
      classify({
        ingredientsText: product.ingredients_text,
        labelText: product.label_text,
        certifiedLabel: product.certified_label,
        confirmations: product.confirmations,
      }),
    [product],
  )
  const validUntil = result.confirmationValidUntil
  const age = infoAge(product)
  return (
    <div className="stack">
      <div className="card result">
        {product.image_url && <img className="product-image" src={product.image_url} alt="" />}
        <h2>{product.name ?? 'Unbenanntes Produkt'}</h2>
        <p className="muted">
          {[product.brand, product.barcode].filter(Boolean).join(' · ')}
        </p>
        <p className="small muted">Angaben eingetragen am {formatDate(age.date)}</p>
        <button onClick={onEdit}>Angaben bearbeiten</button>
      </div>
      {notice && (
        <p className="notice-box" role="status">
          {notice}
        </p>
      )}
      {age.stale && (
        <div className="card stack stale" role="alert">
          <h3 className="box-title">
            <TriangleAlertIcon className="icon-orange" /> Angaben aktualisieren
          </h3>
          <p>
            Die Angaben sind älter als {CONFIRMATION_VALID_MONTHS} Monate (eingetragen am {formatDate(age.date)}). Rezepturen ändern sich –
            bitte das Produkt erneut prüfen.
          </p>
          <button type="button" className="primary" onClick={onRescan}>
            Jetzt neu prüfen
          </button>
        </div>
      )}
      <Verdict result={result} onClose={onBack} />

      <div className="card stack">
        <h3>Herstellerbestätigungen</h3>
        <p className="muted small">
          Eine Bestätigung des Herstellers macht ein Produkt für {CONFIRMATION_VALID_MONTHS} Monate zu
          „Sicher glutenfrei lt. Hersteller“.
          {validUntil && ` Letzte positive Bestätigung gilt bis ${validUntil}.`}
        </p>
        {product.confirmations.length === 0 ? (
          <p className="muted">Noch keine Anfrage dokumentiert.</p>
        ) : (
          <ul className="confirmations">
            {product.confirmations.map((c) => (
              <li key={c.id}>
                <strong>{c.confirmed_at}</strong> – {c.confirms_gluten_free ? (
                  <span className="inline-status ok">
                    <CheckIcon /> glutenfrei bestätigt
                  </span>
                ) : (
                  <span className="inline-status bad">
                    <XIcon /> nicht bestätigt
                  </span>
                )}
                <ContactLine c={c} />
                {c.note && <div className="small">{c.note}</div>}
              </li>
            ))}
          </ul>
        )}
        <ConfirmationForm productId={product.id} onSaved={onChange} />
      </div>
    </div>
  )
}

/** Ansprechpartner, E-Mail (anklickbar) und weitere Angaben einer Bestätigung. */
function ContactLine({ c }: { c: ManufacturerConfirmation }) {
  const parts = [
    c.contact_name,
    c.contact_email && <a key="m" href={`mailto:${c.contact_email}`}>{c.contact_email}</a>,
    c.contact,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <span className="muted">
      {parts.map((p, i) => (
        <span key={i}>
          {' · '}
          {p}
        </span>
      ))}
    </span>
  )
}

function ConfirmationForm({ productId, onSaved }: { productId: string; onSaved: (p: Product) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [confirmedAt, setConfirmedAt] = useState(today)
  const [positive, setPositive] = useState(true)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const p = await repository.addConfirmation(productId, {
        confirmed_at: confirmedAt,
        confirms_gluten_free: positive,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact: contact.trim() || null,
        note: note || null,
      })
      setContactName('')
      setContactEmail('')
      setContact('')
      setNote('')
      onSaved(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form className="stack sub" onSubmit={submit}>
      <h4>Neue Antwort vom Hersteller</h4>
      <div className="row">
        <label>
          Datum der Antwort
          <input type="date" max={today} required value={confirmedAt} onChange={(e) => setConfirmedAt(e.target.value)} />
        </label>
        <label>
          Ergebnis
          <select value={positive ? 'yes' : 'no'} onChange={(e) => setPositive(e.target.value === 'yes')}>
            <option value="yes">Glutenfrei bestätigt</option>
            <option value="no">Nicht bestätigt / Spuren möglich</option>
          </select>
        </label>
      </div>
      <label>
        Ansprechpartner
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="off" />
      </label>
      <label>
        E-Mail-Adresse
        <input type="email" inputMode="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} autoComplete="off" />
      </label>
      <label>
        Weitere Angaben (Funktion, Telefon)
        <input value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" />
      </label>
      <label>
        Notiz / Wortlaut der Antwort
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="primary">Bestätigung speichern</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
