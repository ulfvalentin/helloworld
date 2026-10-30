import { findGlutenSources, normalizeText } from '../lib/classify'
import { parseIngredients } from '../lib/textClean'

/** Zutaten als einzelne Markierungen; glutenhaltige fallen rot auf. */
export function IngredientList({ text }: { text: string | null }) {
  if (!text?.trim()) return <p className="muted">Keine Zutaten erfasst.</p>
  const { items, traces, rest } = parseIngredients(text)
  const hasGluten = (s: string) => findGlutenSources(normalizeText(s)).length > 0
  return (
    <>
      <ul className="chips">
        {items.map((item, i) => (
          <li key={i} className={hasGluten(item) ? 'chip gluten' : 'chip'}>
            {hasGluten(item) && '⚠ '}
            {item}
          </li>
        ))}
      </ul>
      {rest && <p className="traces">{rest}</p>}
      {traces.map((t) => (
        <p key={t} className={hasGluten(t) ? 'traces gluten' : 'traces'}>
          {t}
        </p>
      ))}
    </>
  )
}
