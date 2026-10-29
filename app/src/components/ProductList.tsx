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
    <div className="card stack">
      <h2>Datenbank</h2>
      <div className="row">
        <input placeholder="Suche nach Name, Marke, Barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <p className="muted">Lade …</p>
      ) : shown.length === 0 ? (
        <p className="muted">Noch keine Produkte – scanne dein erstes Lebensmittel.</p>
      ) : (
        <ul className="product-list">
          {shown.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p)}>
                <span>
                  <strong>{p.name ?? 'Unbenannt'}</strong>
                  <span className="muted small"> {p.brand}</span>
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
