import { useState } from 'react'
import { CONFIRMATION_VALID_MONTHS, classify } from '../lib/classify'
import { repository } from '../lib/repository'
import type { Product } from '../types'
import { StatusBadge } from './StatusBadge'

export function Reasons({ reasons }: { reasons: string[] }) {
  return (
    <ul className="reasons">
      {reasons.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  )
}

export function ProductDetail({
  product,
  onChange,
  onEdit,
  onBack,
}: {
  product: Product
  onChange: (p: Product) => void
  onEdit: () => void
  onBack: () => void
}) {
  const validUntil = classify({ confirmations: product.confirmations }).confirmationValidUntil
  return (
    <div className="stack">
      <button className="link" onClick={onBack}>
        ← Zurück
      </button>
      <div className="card result">
        {product.image_url && <img className="product-image" src={product.image_url} alt="" />}
        <h2>{product.name ?? 'Unbenanntes Produkt'}</h2>
        <p className="muted">
          {[product.brand, product.barcode].filter(Boolean).join(' · ')}
        </p>
        <StatusBadge status={product.status} large />
        <Reasons reasons={product.status_reasons} />
        <button onClick={onEdit}>Angaben bearbeiten</button>
      </div>

      <div className="card stack">
        <h3>Herstellerbestätigungen</h3>
        <p className="muted small">
          Eine Bestätigung des Herstellers macht ein Produkt für {CONFIRMATION_VALID_MONTHS} Monate zu
          „geprüft glutenfrei“.
          {validUntil && ` Letzte positive Bestätigung gilt bis ${validUntil}.`}
        </p>
        {product.confirmations.length === 0 ? (
          <p className="muted">Noch keine Anfrage dokumentiert.</p>
        ) : (
          <ul className="confirmations">
            {product.confirmations.map((c) => (
              <li key={c.id}>
                <strong>{c.confirmed_at}</strong> – {c.confirms_gluten_free ? '✅ glutenfrei bestätigt' : '❌ nicht bestätigt'}
                {c.contact && <span className="muted"> · {c.contact}</span>}
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

function ConfirmationForm({ productId, onSaved }: { productId: string; onSaved: (p: Product) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [confirmedAt, setConfirmedAt] = useState(today)
  const [positive, setPositive] = useState(true)
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
        contact: contact || null,
        note: note || null,
      })
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
        Kontakt (E-Mail, Telefon, Ansprechpartner)
        <input value={contact} onChange={(e) => setContact(e.target.value)} />
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
