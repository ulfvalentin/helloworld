import { useMemo, useState } from 'react'
import { PencilIcon, SearchIcon } from '../../components/icons'
import { CheckProgress } from '../../components/CheckProgress'
import { PhotoButtons } from '../../components/PhotoButtons'
import { Verdict } from '../../components/Verdict'
import { classify } from '../../lib/classify'
import { lookupManufacturer } from '../../lib/manufacturer'
import { repository } from '../../lib/repository'
import { assembleDraft } from '../../lib/runCheck'
import type { ProgressStep } from '../../lib/runCheck'
import type { CheckReport, Draft, IngredientInfo, Product, ProductInput } from '../../types'
import { CheckSteps } from './CheckSteps'
import { IngredientsSection } from './IngredientsSection'
import { Notes } from './Notes'
import { ProductSummary } from './ProductSummary'

/**
 * Scan-Seite: das Ergebnis nach dem Scan. Einstufung mit Begründung, Zutaten, Produktangaben und Speichern.
 * Beschreibung und Regeln: FEATURE.md in diesem Ordner.
 */
export function ScanPage({
  draft,
  onSaved,
  onCancel,
  onAddPhotos,
  steps = null,
  checkError = null,
}: {
  draft: Draft
  onSaved: (p: Product) => void
  onCancel: () => void
  /** Prüft erneut mit den bisherigen plus diesen Fotos; `carry` übernimmt die bisherigen Angaben */
  onAddPhotos?: (files: File[], carry: { barcode: string | null; name: string | null; brand: string | null }) => void
  /** Fortschritt der erneuten Prüfung (`null`: keine läuft) */
  steps?: ProgressStep[] | null
  checkError?: string | null
}) {
  const [input, setInput] = useState<ProductInput>(draft.input)
  const [ingredients, setIngredients] = useState<IngredientInfo>(draft.ingredients)
  const [check, setCheck] = useState<CheckReport>(draft.check)
  const [context, setContext] = useState(draft.context)
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
  // Wurden weder Zutaten noch ein verlässlicher Text erkannt, lassen sich weitere Fotos nachreichen
  const needsMorePhotos = Boolean(onAddPhotos) && !context.edit && (!input.ingredients_text || !reliable)
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }))

  const canSearch = Boolean(input.name || input.barcode || draft.hints.length >= 3)

  /** „Hersteller-Website prüfen“: sucht erneut mit den (ggf. korrigierten) Angaben und berechnet den Abgleich neu. */
  async function checkManufacturer() {
    setLooking(true)
    const found = await lookupManufacturer({
      name: input.name,
      brand: input.brand,
      barcode: input.barcode,
      urls: draft.websites,
      hints: draft.hints,
    })
    // Angaben, die der Nutzer geändert hat, haben Vorrang
    const next = assembleDraft(
      { ...context, code: input.barcode ?? context.code, searched: true, manufacturer: found },
      {
        name: input.name !== check.identity.name ? input.name : null,
        brand: input.brand !== (check.identity.brand ?? check.identity.company) ? input.brand : null,
      },
    )
    setContext(next.context)
    setCheck(next.check)
    setIngredients(next.ingredients)
    setEdited(false)
    setInput((prev) => ({
      ...prev,
      name: prev.name ?? next.input.name,
      brand: prev.brand ?? next.input.brand,
      ingredients_text: next.input.ingredients_text,
      label_text: next.input.label_text,
    }))
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
    <div className="stack" aria-label="Scan-Seite" data-page="scan-page">
      <Verdict result={result} />
      <ProductSummary input={input} identity={check.identity} />

      {needsMorePhotos && (
        <div className="card stack">
          <h3>Weitere Fotos hinzufügen</h3>
          <ul>
            <li>
              {input.ingredients_text
                ? 'Die Zutatenliste war schwer lesbar.'
                : 'Es wurde keine Zutatenliste erkannt.'}
            </li>
            <li>Zutatenliste einzeln, aus der Nähe, gerade und scharf fotografieren.</li>
            <li>Die bisherigen Fotos bleiben erhalten.</li>
          </ul>
          <PhotoButtons
            disabled={Boolean(steps)}
            onPick={(files) =>
              onAddPhotos!(files, { barcode: input.barcode, name: input.name, brand: input.brand })
            }
          />
          {steps && <CheckProgress steps={steps} />}
          {checkError && <p className="error">{checkError}</p>}
        </div>
      )}

      <div className="card stack">
        <h3>Zutaten</h3>
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
          <IngredientsSection
            text={input.ingredients_text}
            info={ingredients}
            edited={edited}
            reconciliation={check.reconciliation}
          />
        )}
        <div className="row">
          <button type="button" onClick={() => setEditing(!editing)}>
            {editing ? (
              'Fertig'
            ) : (
              <>
                <PencilIcon /> Zutaten korrigieren
              </>
            )}
          </button>
          {ingredients.source !== 'hersteller' && (
            <button type="button" onClick={checkManufacturer} disabled={looking || !canSearch}>
              {looking ? (
                'Suche läuft …'
              ) : (
                <>
                  <SearchIcon /> Hersteller-Website prüfen
                </>
              )}
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

      <Notes notes={check.notes} />
      {!context.edit && <CheckSteps check={check} />}

      <div className="card stack">
        <h3>Produkt bearbeiten</h3>
        <div className="row">
          <label>
            Produkt
            <input value={input.name ?? ''} onChange={(e) => set('name', e.target.value || null)} />
          </label>
          <label>
            Hersteller / Marke
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
