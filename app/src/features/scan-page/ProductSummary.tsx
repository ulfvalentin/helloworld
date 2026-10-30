import type { CheckReport, ProductInput } from '../../types'

/** Produkt, Hersteller und Barcode auf einen Blick, mit der Quelle jeder Angabe. */
export function ProductSummary({ input, identity }: { input: ProductInput; identity: CheckReport['identity'] }) {
  const sourceOf = (value: string | null, original: string | null, from?: string) =>
    value && value === original ? from : value ? 'eingegeben' : undefined
  const brandFrom = sourceOf(input.brand, identity.brand ?? identity.company, identity.from.brand ?? identity.from.company)
  const company = identity.company && identity.company !== input.brand ? identity.company : null
  const rows: { label: string; parts: { value: string | null; from?: string }[] }[] = [
    { label: 'Produkt', parts: [{ value: input.name, from: sourceOf(input.name, identity.name, identity.from.name) }] },
    {
      label: 'Hersteller',
      parts: input.brand || company
        ? [
            ...(input.brand ? [{ value: input.brand, from: brandFrom }] : []),
            ...(company ? [{ value: company, from: identity.from.company }] : []),
          ]
        : [{ value: null }],
    },
    { label: 'Barcode', parts: [{ value: input.barcode, from: sourceOf(input.barcode, identity.barcode, identity.from.barcode) }] },
  ]
  return (
    <section className="card summary" aria-label="Produkt">
      <dl>
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd className={r.parts[0].value ? undefined : 'missing'}>
              {r.parts.map((p, i) => (
                <span key={i} className="summary-part">
                  {p.value ?? 'nicht erkannt'}
                  {p.from && <small> · {p.from}</small>}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
