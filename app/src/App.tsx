import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AccountMenu } from './components/AccountMenu'
import { Login } from './components/Login'
import { LogoHorizontal, LogoStacked } from './components/Logo'
import { ProductDetail } from './components/ProductDetail'
import { DatabaseIcon } from './components/icons'
import { ProductList } from './components/ProductList'
import { Scanner } from './components/Scanner'
import { ScanPage } from './features/scan-page'
import { repository } from './lib/repository'
import { supabase } from './lib/supabase'
import { stripProduct, useScanFlow } from './lib/useScanFlow'
import type { Draft, Product } from './types'

type View =
  | { kind: 'scan' }
  | { kind: 'draft'; draft: Draft }
  | { kind: 'list' }
  | { kind: 'product'; product: Product }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'scan' })
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const scan = useScanFlow((draft) => setView({ kind: 'draft', draft }))

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
            <AccountMenu email={session.user.email ?? null} onSignOut={() => supabase!.auth.signOut()} />
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
          <Scanner scan={scan} />
        ) : view.kind === 'draft' ? (
          <ScanPage
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
                  ingredients: { source: 'datenbank', trusted: true, url: null, lookup: 'skipped', message: null },
                  websites: [],
                  hints: [],
                },
              })
            }
          />
        )}
      </main>
      {!needsLogin && (
        <nav>
          {/* In der Scan-Ansicht startet „Prüfen“ die Auswertung, sonst führt es zurück zum Scannen */}
          <button
            className={tab === 'scan' ? 'active' : ''}
            aria-disabled={view.kind === 'scan' && !scan.canStart}
            onClick={() => (view.kind === 'scan' ? scan.start() : setView({ kind: 'scan' }))}
          >
            {scan.busy ? 'Prüfe …' : 'Prüfen'}
          </button>
          <button className={tab === 'list' ? 'active' : ''} onClick={() => setView({ kind: 'list' })}>
            <DatabaseIcon /> Datenbank
          </button>
        </nav>
      )}
    </div>
  )
}
