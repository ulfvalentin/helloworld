import { useMemo, useState } from 'react'
import { completeFromManufacturer } from '../features/email-import/completeProduct'
import { CONFIRMATION_VALID_MONTHS, classify } from '../lib/classify'
import { formatDate, infoAge } from '../lib/infoAge'
import { lookupManufacturer } from '../lib/manufacturer'
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
  onDeleted,
  notice,
}: {
  product: Product
  onChange: (p: Product) => void
  onEdit: () => void
  onBack: () => void
  /** Führt zum Scan-Bildschirm, um das Produkt neu zu prüfen */
  onRescan: () => void
  /** Nach dem Löschen des Eintrags */
  onDeleted: () => void
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
  const [searching, setSearching] = useState(false)
  const [searchNotice, setSearchNotice] = useState<string | null>(null)
  const missing = !product.ingredients_text || !product.image_url

  /** Herstellerseite (bei Bedarf Händlerseiten) nach fehlenden Zutaten und Foto durchsuchen */
  async function search() {
    setSearching(true)
    setSearchNotice(null)
    try {
      const done = await completeFromManufacturer({ repository, lookupManufacturer }, product.id)
      if (done.product) onChange(done.product)
      setSearchNotice(done.notice)
    } catch (e) {
      setSearchNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }
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
      {(searchNotice ?? notice) && (
        <p className="notice-box" role="status">
          {searchNotice ?? notice}
        </p>
      )}
      {missing && (
        <button type="button" onClick={search} disabled={searching}>
          {searching ? 'Suche läuft …' : `${!product.ingredients_text ? 'Zutaten' : 'Foto'}${!product.ingredients_text && !product.image_url ? ' und Foto' : ''} online suchen`}
        </button>
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

      <DeleteProduct product={product} onDeleted={onDeleted} />
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

/** Grauer Button ganz unten; erst nach einer Rückfrage wird gelöscht. */
function DeleteProduct({ product, onDeleted }: { product: Product; onDeleted: () => void }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await repository.deleteProduct(product.id)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  if (!asking)
    return (
      <button type="button" className="delete-button" onClick={() => setAsking(true)}>
        Datenbankeintrag löschen
      </button>
    )
  return (
    <div className="card stack" role="alertdialog" aria-label="Eintrag löschen">
      <p>
        „{product.name ?? 'Unbenanntes Produkt'}“ mit allen Herstellerbestätigungen löschen? Das kann nicht rückgängig gemacht werden.
      </p>
      <button type="button" className="delete-button" onClick={remove} disabled={busy}>
        {busy ? 'Lösche …' : 'Endgültig löschen'}
      </button>
      <button type="button" className="text-button" onClick={() => setAsking(false)} disabled={busy}>
        Abbrechen
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
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
