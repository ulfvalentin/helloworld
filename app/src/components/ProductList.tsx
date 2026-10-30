import { useEffect, useState } from 'react'
import { STATUS_META } from '../lib/classify'
import { repository } from '../lib/repository'
import type { GlutenStatus, Product } from '../types'
import { StatusBadge } from './StatusBadge'

export function ProductList({ onOpen }: { onOpen: (p: Product) => void }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<GlutenStatus | ''>('')
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      repository
        .listProducts(search.trim() || undefined)
        .then((list) => !cancelled && setProducts(list))
        .catch((e) => !cancelled && setError(e.message))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [search])

  const shown = products?.filter((p) => !filter || p.status === filter) ?? []
  return (
    <div className="page stack">
      <h1>Datenbank</h1>
      <div className="row">
        <label>
          Suche
          <input placeholder="Name, Marke oder Barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select value={filter} onChange={(e) => setFilter(e.target.value as GlutenStatus | '')}>
          <option value="">Alle</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {products === null ? (
        <div className="skeletons" role="status" aria-label="Produkte werden geladen …">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">Keine Produkte gefunden. Prüfe jetzt ein Lebensmittel mit „Prüfen“.</p>
      ) : (
        <ul className="product-list">
          {shown.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p)}>
                <span>
                  <strong>{p.name ?? 'Unbenannt'}</strong>
                  {p.brand && <span className="muted small"> {p.brand}</span>}
                </span>
                <StatusBadge status={p.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
