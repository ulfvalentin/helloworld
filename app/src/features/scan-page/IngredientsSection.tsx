import { ExternalLinkIcon, TriangleAlertIcon, XIcon } from '../../components/icons'
import { findGlutenSources, normalizeText } from '../../lib/classify'
import { parseIngredients } from '../../lib/textClean'
import type { IngredientInfo, IngredientSource, Reconciliation } from '../../types'

const SOURCE_TITLE: Record<IngredientSource, string> = {
  foto: 'Zutaten vom Foto',
  datenbank: 'Zutaten aus eurer Datenbank',
  openfoodfacts: 'Zutaten aus Open Food Facts',
  hersteller: 'Zutaten von der Hersteller-Website',
}

/** Hinweiskasten mit rotem X und Aufzählung, wenn die Zutaten nicht verwertbar sind. */
function Problem({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="notice-box warn">
      <p className="box-title">
        <XIcon className="icon-red" />
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

function ItemList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className={findGlutenSources(normalizeText(item)).length > 0 ? 'gluten' : undefined}>
          {item}
        </li>
      ))}
    </ul>
  )
}

/**
 * Zutatenliste im Design des Hinweiskastens: Titel (Quelle), darunter die vollständige Aufzählung. Es stehen nur
 * Zutaten drin (keine Zubereitung, Lagerung, Fußnoten oder Spurenhinweise – die stehen unter „Hinweise“).
 * Ist die Liste nur unsicher vom Foto gelesen, steht darüber das rote X mit dem Hinweis, die Liste bleibt aber sichtbar.
 */
export function IngredientsSection({
  text,
  info,
  edited,
  reconciliation,
}: {
  text: string | null
  info: IngredientInfo
  edited: boolean
  reconciliation?: Reconciliation
}) {
  const items = text ? parseIngredients(text).items : []

  if (items.length === 0)
    return (
      <Problem
        title="Keine Zutaten gefunden"
        items={[
          'Zutatenliste einzeln, aus der Nähe und gerade fotografieren',
          'oder die Zutaten selbst eintragen („Zutaten korrigieren“)',
        ]}
      />
    )

  if (!edited && info.source !== null && !info.trusted)
    return (
      <div className="stack">
        <Problem
          title="Fotos schwer lesbar, die Zutaten sind unsicher"
          items={[
            'Zutatenliste einzeln und aus der Nähe fotografieren',
            'oder Produktnamen eintragen und „Hersteller-Website prüfen“ tippen',
            'oder die Zutaten selbst korrigieren',
          ]}
        />
        <div className="notice-box">
          <p className="box-title">
            <strong>Vom Foto gelesen (unsicher)</strong>
          </p>
          <ItemList items={items} />
        </div>
      </div>
    )

  const similar = !edited && info.exact === false
  const title = edited ? 'Zutaten (von dir korrigiert)' : SOURCE_TITLE[info.source ?? 'foto']
  return (
    <div className={similar ? 'notice-box warn' : 'notice-box'}>
      <p className="box-title">
        {similar && <TriangleAlertIcon className="icon-orange" />}
        <strong>{title}</strong>
      </p>
      {info.url && !edited && (
        <a href={info.url} target="_blank" rel="noopener noreferrer" className="box-link">
          Seite öffnen <ExternalLinkIcon size={14} />
        </a>
      )}
      {similar && <p className="box-note">Passendes, aber nicht eindeutig dasselbe Produkt – bitte mit der Packung vergleichen.</p>}
      {!edited && reconciliation && (reconciliation.status === 'consistent' || reconciliation.status === 'differs') && (
        <p className="box-note">{reconciliation.summary}</p>
      )}
      <ItemList items={items} />
    </div>
  )
}
