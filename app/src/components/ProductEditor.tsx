import { useMemo, useState } from 'react'
import { classify } from '../lib/classify'
import { applyManufacturer, lookupManufacturer } from '../lib/manufacturer'
import { repository } from '../lib/repository'
import type { Draft, IngredientInfo, Product, ProductInput } from '../types'
import { IngredientList } from './IngredientList'
import { Reasons } from './ProductDetail'
import { StatusBadge } from './StatusBadge'

const SOURCE_LABEL = {
  foto: 'Vom Foto gelesen',
  datenbank: 'Aus eurer Datenbank',
  openfoodfacts: 'Aus Open Food Facts',
  hersteller: 'Von der Hersteller-Website',
} as const

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="notice-box warn">
      <p>
        <strong>{title}</strong>
      </p>
      <ul>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

function IngredientNotice({ info, edited }: { info: IngredientInfo; edited: boolean }) {
  if (edited) return <p className="notice-box">Von dir korrigiert</p>
  if (info.source === null)
    return (
      <Bullets
        title="Keine Zutaten gefunden."
        items={[
          'Zutatenliste einzeln, aus der Nähe und gerade fotografieren',
          'oder die Zutaten selbst eintragen („Zutaten korrigieren“)',
        ]}
      />
    )
  if (!info.trusted)
    return (
      <Bullets
        title="Das Foto war schwer lesbar – die Zutaten sind unsicher."
        items={[
          'Zutatenliste einzeln und aus der Nähe fotografieren',
          'oder Produktnamen eintragen und „Hersteller-Website prüfen“ tippen',
          'oder die Zutaten selbst korrigieren',
        ]}
      />
    )
  return (
    <p className={info.exact === false ? 'notice-box warn' : 'notice-box'}>
      {info.exact === false
        ? '⚠️ Zutaten eines passenden Produkts von der Hersteller-Website, aber nicht eindeutig dasselbe – bitte mit der Packung vergleichen.'
        : SOURCE_LABEL[info.source]}
      {info.url && (
        <>
          {' · '}
          <a href={info.url} target="_blank" rel="noopener noreferrer">
            Seite öffnen
          </a>
        </>
      )}
    </p>
  )
}

/** Ergebnis prüfen, korrigieren und in die gemeinsame Datenbank übernehmen. */
export function ProductEditor({
  draft,
  onSaved,
  onCancel,
}: {
  draft: Draft
  onSaved: (p: Product) => void
  onCancel: () => void
}) {
  const [input, setInput] = useState<ProductInput>(draft.input)
  const [ingredients, setIngredients] = useState<IngredientInfo>(draft.ingredients)
  const [editing, setEditing] = useState(false)
  // Hat der Nutzer die Zutaten selbst eingegeben/korrigiert, gelten sie als geprüft
  const [edited, setEdited] = useState(false)
  const [looking, setLooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reliable = ingredients.trusted || edited
  const result = useMemo(
    () =>
      classify({
        ingredientsText: input.ingredients_text,
        labelText: input.label_text,
        certifiedLabel: input.certified_label,
        externalTags: input.external_tags,
        confirmations: draft.existing?.confirmations,
        ingredientsReliable: reliable,
      }),
    [input, draft.existing, reliable],
  )
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }))

  const canSearch = Boolean(input.name || input.barcode || draft.hints.length >= 3)

  async function checkManufacturer() {
    setLooking(true)
    const found = await lookupManufacturer({
      name: input.name,
      brand: input.brand,
      barcode: input.barcode,
      urls: draft.websites,
      hints: draft.hints,
    })
    if (!found) setIngredients({ ...ingredients, lookup: 'unavailable', message: 'Die Suche ist gerade nicht erreichbar.' })
    else if (found.found && found.ingredients) {
      setInput(applyManufacturer(input, found))
      setEdited(false)
      setIngredients({ source: 'hersteller', trusted: true, url: found.sourceUrl, exact: found.exact, lookup: 'found', message: found.message })
    } else setIngredients({ ...ingredients, lookup: 'not-found', message: found.message })
    setLooking(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      // Eine unsicher gelesene, nicht korrigierte Liste nicht speichern: Sie würde später ohne den Warnhinweis
      // als „Keine glutenhaltigen Zutaten“ erscheinen. Der Rohtext (label_text) bleibt und wird auf Gluten durchsucht.
      const toSave = reliable ? input : { ...input, ingredients_text: null }
      const product = await repository.saveProduct(toSave, draft.existing?.id)
      await repository.recordScan(product.id, draft.ocrText)
      onSaved(product)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      <div className="card result">
        <StatusBadge status={result.status} large />
        <Reasons reasons={result.reasons} />
        {draft.sources.length > 0 && <p className="muted small">Quellen: {draft.sources.join(', ')}</p>}
      </div>

      <div className="card stack">
        <h3>Zutaten</h3>
        <IngredientNotice info={ingredients} edited={edited} />
        {editing ? (
          <textarea
            rows={6}
            value={input.ingredients_text ?? ''}
            onChange={(e) => {
              set('ingredients_text', e.target.value || null)
              setEdited(true)
            }}
            aria-label="Zutaten"
          />
        ) : (
          <IngredientList text={input.ingredients_text} />
        )}
        <div className="row">
          <button type="button" onClick={() => setEditing(!editing)}>
            {editing ? 'Fertig' : '✏️ Zutaten korrigieren'}
          </button>
          {ingredients.source !== 'hersteller' && (
            <button type="button" onClick={checkManufacturer} disabled={looking || !canSearch}>
              {looking ? 'Suche läuft …' : '🔎 Hersteller-Website prüfen'}
            </button>
          )}
        </div>
        {!canSearch && ingredients.source !== 'hersteller' && (
          <p className="muted small">Für die Suche zuerst unten den Produktnamen eintragen.</p>
        )}
        {ingredients.message && ingredients.lookup !== 'found' && (
          <p className="muted small">{ingredients.message}</p>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={input.certified_label}
            onChange={(e) => set('certified_label', e.target.checked)}
          />
          <span>
            <strong>Zertifizierungslogo auf der Packung</strong> (durchgestrichene Ähre mit Lizenznummer,
            z. B. „DE-020-012“)
          </span>
        </label>
        {input.certified_label && (
          <label>
            Lizenznummer / Notiz zum Logo
            <input
              value={input.certification_note ?? ''}
              onChange={(e) => set('certification_note', e.target.value || null)}
            />
          </label>
        )}
      </div>

      <div className="card stack">
        <h3>Produkt</h3>
        <div className="row">
          <label>
            Produkt
            <input value={input.name ?? ''} onChange={(e) => set('name', e.target.value || null)} />
          </label>
          <label>
            Marke
            <input value={input.brand ?? ''} onChange={(e) => set('brand', e.target.value || null)} />
          </label>
        </div>
        <label>
          Barcode
          <input
            inputMode="numeric"
            value={input.barcode ?? ''}
            onChange={(e) => set('barcode', e.target.value.replace(/\D/g, '') || null)}
          />
        </label>
        <details>
          <summary>Erkannten Text vom Foto anzeigen</summary>
          <textarea
            rows={6}
            value={input.label_text ?? ''}
            onChange={(e) => set('label_text', e.target.value || null)}
            aria-label="Erkannter Text"
          />
          <p className="muted small">
            Wird zusätzlich auf Gluten durchsucht, auch wenn er in der Zutatenliste oben nicht auftaucht.
          </p>
        </details>
        {input.external_tags.length > 0 && (
          <p className="muted small">Open Food Facts: {input.external_tags.join(', ')}</p>
        )}
        <div className="row">
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'Speichere …' : draft.existing ? 'Aktualisieren' : 'In Datenbank speichern'}
          </button>
          <button onClick={onCancel}>Abbrechen</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
