import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './components/Login'
import { LogoHorizontal, LogoStacked } from './components/Logo'
import { ProductDetail } from './components/ProductDetail'
import { ProductEditor } from './components/ProductEditor'
import { ProductList } from './components/ProductList'
import { type Draft, Scanner, stripProduct } from './components/Scanner'
import { repository } from './lib/repository'
import { supabase } from './lib/supabase'
import type { Product } from './types'

type View =
  | { kind: 'scan' }
  | { kind: 'draft'; draft: Draft }
  | { kind: 'list' }
  | { kind: 'product'; product: Product }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'scan' })
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const needsLogin = supabase && session === null
  const tab = view.kind === 'list' || view.kind === 'product' ? 'list' : 'scan'

  return (
    <div className="app">
      {/* Auf Splash und Login steht das gestapelte Logo – dort kein zweites im Header */}
      {session !== undefined && !needsLogin && (
        <header>
          <LogoHorizontal />
          {supabase && session && (
            <button className="link" onClick={() => supabase!.auth.signOut()}>
              Abmelden
            </button>
          )}
        </header>
      )}
      {repository.mode === 'local' && (
        <p className="notice">
          Demo-Modus: Keine Supabase-Verbindung konfiguriert – Daten werden nur in diesem Browser gespeichert.
        </p>
      )}
      <main>
        {session === undefined ? (
          <div className="splash">
            <LogoStacked />
          </div>
        ) : needsLogin ? (
          <Login />
        ) : view.kind === 'scan' ? (
          <Scanner onDraft={(draft) => setView({ kind: 'draft', draft })} />
        ) : view.kind === 'draft' ? (
          <ProductEditor
            draft={view.draft}
            onSaved={(product) => setView({ kind: 'product', product })}
            onCancel={() => setView({ kind: 'scan' })}
          />
        ) : view.kind === 'list' ? (
          <ProductList onOpen={(product) => setView({ kind: 'product', product })} />
        ) : (
          <ProductDetail
            product={view.product}
            onChange={(product) => setView({ kind: 'product', product })}
            onBack={() => setView({ kind: 'list' })}
            onEdit={() =>
              setView({
                kind: 'draft',
                draft: {
                  input: stripProduct(view.product),
                  existing: view.product,
                  ocrText: null,
                  sources: ['Eigene Datenbank'],
                },
              })
            }
          />
        )}
      </main>
      {!needsLogin && (
        <nav>
          <button className={tab === 'scan' ? 'active' : ''} onClick={() => setView({ kind: 'scan' })}>
            📷 Prüfen
          </button>
          <button className={tab === 'list' ? 'active' : ''} onClick={() => setView({ kind: 'list' })}>
            📚 Datenbank
          </button>
        </nav>
      )}
    </div>
  )
}
