import { useState } from 'react'
import { CheckIcon, MailIcon } from '../../components/icons'
import { StatusBadge } from '../../components/StatusBadge'
import { repository } from '../../lib/repository'
import { EMPTY_INPUT } from '../../lib/runCheck'
import type { Product } from '../../types'
import { type ParsedEmail, parseEmail } from './parseEmail'

const words = (s: string | null) => (s ?? '').toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 3)

/** Vorhandene Produkte, die zur Mail passen: per Barcode, sonst per Namensähnlichkeit. */
async function findCandidates(mail: ParsedEmail): Promise<Product[]> {
  const found = new Map<string, Product>()
  if (mail.barcode) {
    const p = await repository.getByBarcode(mail.barcode)
    if (p) found.set(p.id, p)
  }
  const wanted = words(mail.product)
  for (const w of wanted.slice(0, 2)) {
    for (const p of await repository.listProducts(w)) found.set(p.id, p)
  }
  const score = (p: Product) => {
    const have = new Set(words(`${p.name} ${p.brand}`))
    return wanted.filter((w) => have.has(w)).length / Math.max(wanted.length, 1)
  }
  return [...found.values()]
    .filter((p) => p.barcode === mail.barcode || score(p) >= 0.5)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5)
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * E-Mail eines Herstellers einfügen oder hochladen. Produkt, Hersteller, Datum und Aussage werden erkannt;
 * nach der Kontrolle landet das Produkt mit der Bestätigung in der Datenbank (siehe FEATURE.md).
 */
export function EmailImport({ onSaved }: { onSaved: (p: Product) => void }) {
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParsedEmail | null>(null)
  const [candidates, setCandidates] = useState<Product[]>([])
  const [target, setTarget] = useState<string>('new') // id eines vorhandenen Produkts oder „new“
  const [product, setProduct] = useState('')
  const [brand, setBrand] = useState('')
  const [barcode, setBarcode] = useState('')
  const [date, setDate] = useState(today())
  const [positive, setPositive] = useState(true)
  const [note, setNote] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function read(text: string) {
    setError(null)
    if (!text.trim()) return
    const mail = parseEmail(text)
    setParsed(mail)
    setProduct(mail.product ?? '')
    setBrand(mail.manufacturer ?? '')
    setBarcode(mail.barcode ?? '')
    setDate(mail.date ?? today())
    setPositive(mail.verdict !== 'no')
    setNote(
      [mail.quote && `„${mail.quote}“`, `E-Mail${mail.subject ? ` „${mail.subject}“` : ''}${mail.fromName ? ` von ${mail.fromName}` : ''}`]
        .filter(Boolean)
        .join(' – '),
    )
    setContact([mail.fromName, mail.fromEmail && `<${mail.fromEmail}>`].filter(Boolean).join(' '))
    try {
      const list = await findCandidates(mail)
      setCandidates(list)
      setTarget(list[0]?.id ?? 'new')
    } catch {
      setCandidates([])
      setTarget('new')
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    setRaw(text)
    await read(text)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      let id = target === 'new' ? null : target
      if (!id) {
        const created = await repository.saveProduct({
          ...EMPTY_INPUT,
          name: product.trim() || null,
          brand: brand.trim() || null,
          barcode: barcode.trim() || null,
        })
        id = created.id
      }
      const saved = await repository.addConfirmation(id, {
        confirmed_at: date,
        confirms_gluten_free: positive,
        contact: contact || null,
        note: note || null,
      })
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const unclear = parsed?.verdict === 'unclear'
  return (
    <div className="stack" data-page="email-import">
      <div className="card stack">
        <h2>E-Mail vom Hersteller</h2>
        <ol className="steps">
          <li><strong>E-Mail-Text hier einfügen</strong><span className="muted small">Auch eine weitergeleitete Mail.</span></li>
          <li><strong>Oder eine .eml-Datei hochladen</strong></li>
          <li><strong>Erkanntes prüfen und speichern</strong></li>
        </ol>
        <textarea rows={8} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="E-Mail-Text einfügen …" aria-label="E-Mail-Text" />
        <div className="photo-buttons">
          <button className="photo-button" type="button" onClick={() => read(raw)} disabled={!raw.trim()}>
            <MailIcon /> E-Mail auslesen
          </button>
          <label className="photo-button secondary">
            Datei hochladen
            <input type="file" accept=".eml,.txt,message/rfc822,text/plain" onChange={onFile} hidden />
          </label>
        </div>
      </div>

      {parsed && (
        <div className="card stack">
          <h3>Erkannt</h3>
          {unclear && (
            <p className="notice-box warn">
              In der Mail steht keine eindeutige Aussage zu Gluten. Bitte das Ergebnis selbst wählen.
            </p>
          )}
          <label>
            Produkt
            <input value={product} onChange={(e) => setProduct(e.target.value)} />
          </label>
          <div className="row">
            <label>
              Hersteller
              <input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label>
              Barcode
              <input inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          <label>
            In der Datenbank
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  Zu vorhandenem Produkt: {p.name ?? 'Unbenannt'}{p.brand ? ` (${p.brand})` : ''}
                </option>
              ))}
              <option value="new">Neues Produkt anlegen</option>
            </select>
          </label>
          {candidates.find((p) => p.id === target) && (
            <p className="small">
              Bisher: <StatusBadge status={candidates.find((p) => p.id === target)!.status} />
            </p>
          )}
          <div className="row">
            <label>
              Datum der Antwort
              <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Ergebnis
              <select value={positive ? 'yes' : 'no'} onChange={(e) => setPositive(e.target.value === 'yes')}>
                <option value="yes">Glutenfrei bestätigt</option>
                <option value="no">Nicht bestätigt / Spuren möglich</option>
              </select>
            </label>
          </div>
          {!parsed.date && <p className="muted small">Kein Datum in der Mail gefunden – heutiges Datum eingesetzt.</p>}
          <label>
            Kontakt
            <input value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
          <label>
            Notiz / Wortlaut der Antwort
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="primary" onClick={save} disabled={busy || (target === 'new' && !product.trim())}>
            <CheckIcon /> {busy ? 'Speichere …' : 'Mit Bestätigung speichern'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  )
}
