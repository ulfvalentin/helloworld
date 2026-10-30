import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AccountMenu } from './components/AccountMenu'
import { Login } from './components/Login'
import { LogoHorizontal, LogoStacked } from './components/Logo'
import { ProductDetail } from './components/ProductDetail'
import { DatabaseIcon, MailIcon, ScanLineIcon } from './components/icons'
import { ProductList } from './components/ProductList'
import { Scanner } from './components/Scanner'
import { EmailImport } from './features/email-import'
import { ScanPage } from './features/scan-page'
import { repository } from './lib/repository'
import { supabase } from './lib/supabase'
import { draftFromProduct } from './lib/runCheck'
import { useScanFlow } from './lib/useScanFlow'
import type { Draft, Product } from './types'

type View =
  | { kind: 'scan' }
  | { kind: 'draft'; draft: Draft; id: number }
  | { kind: 'list' }
  | { kind: 'email' }
  | { kind: 'product'; product: Product }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'scan' })
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  // `id` setzt die Scan-Seite bei einer neuen Prüfung zurück (z. B. nach weiteren Fotos)
  const draftId = useRef(0)
  const scan = useScanFlow((draft) => setView({ kind: 'draft', draft, id: ++draftId.current }))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const needsLogin = supabase && session === null
  const tab = view.kind === 'list' || view.kind === 'product' ? 'list' : view.kind === 'email' ? 'email' : 'scan'

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
            key={view.id}
            draft={view.draft}
            onAddPhotos={(files, carry) => scan.addPhotos(files, carry)}
            steps={scan.steps}
            checkError={scan.error}
            onSaved={(product) => setView({ kind: 'product', product })}
            onCancel={() => setView({ kind: 'scan' })}
          />
        ) : view.kind === 'email' ? (
          <EmailImport onSaved={(product) => setView({ kind: 'product', product })} />
        ) : view.kind === 'list' ? (
          <ProductList onOpen={(product) => setView({ kind: 'product', product })} />
        ) : (
          <ProductDetail
            product={view.product}
            onChange={(product) => setView({ kind: 'product', product })}
            onBack={() => setView({ kind: 'list' })}
            onEdit={() => setView({ kind: 'draft', draft: draftFromProduct(view.product), id: ++draftId.current })}
          />
        )}
      </main>
      {!needsLogin && (
        <nav aria-label="Hauptmenü">
          {/* In der Scan-Ansicht startet „Prüfen“ die Auswertung, sonst führt es zurück zum Scannen */}
          <button
            className={tab === 'scan' ? 'active' : ''}
            aria-current={tab === 'scan' ? 'page' : undefined}
            aria-disabled={view.kind === 'scan' && !scan.canStart}
            onClick={() => (view.kind === 'scan' ? scan.start() : setView({ kind: 'scan' }))}
          >
            <ScanLineIcon size={24} />
            {scan.busy ? 'Prüfe …' : 'Prüfen'}
          </button>
          <button
            className={tab === 'email' ? 'active' : ''}
            aria-current={tab === 'email' ? 'page' : undefined}
            onClick={() => setView({ kind: 'email' })}
          >
            <MailIcon size={24} /> E-Mail
          </button>
          <button
            className={tab === 'list' ? 'active' : ''}
            aria-current={tab === 'list' ? 'page' : undefined}
            onClick={() => setView({ kind: 'list' })}
          >
            <DatabaseIcon size={24} /> Datenbank
          </button>
        </nav>
      )}
    </div>
  )
}
