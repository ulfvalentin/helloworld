import { useState } from 'react'
import { authErrorMessage } from '../lib/authErrors'
import { supabase } from '../lib/supabase'
import { LogoStacked } from './Logo'

type Mode = 'password' | 'link'

/** Anmeldung per E-Mail + Passwort (ohne E-Mail-Versand) oder per Login-Link. */
export function Login() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    // Bei Erfolg meldet App den Nutzer über onAuthStateChange an; hier ist nichts weiter zu tun.
    const { error } =
      mode === 'password'
        ? await supabase!.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase!.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: window.location.origin },
          })
    setBusy(false)
    if (error) setError(authErrorMessage(error.message))
    else if (mode === 'link') setSent(true)
  }

  function switchMode() {
    setMode(mode === 'password' ? 'link' : 'password')
    setError(null)
    setSent(false)
  }

  return (
    <div className="splash">
      <LogoStacked />
      <div className="card" style={{ width: '100%' }}>
        <h2>Anmelden</h2>
        {sent ? (
          <div className="stack">
            <p>Wir haben dir einen Login-Link an {email} geschickt.</p>
            <button type="button" className="link" onClick={switchMode}>
              Lieber mit Passwort anmelden
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <label>
              E-Mail
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {mode === 'password' && (
              <label>
                Passwort
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'Einen Moment …' : mode === 'password' ? 'Anmelden' : 'Login-Link senden'}
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="link" onClick={switchMode}>
              {mode === 'password' ? 'Stattdessen Login-Link per E-Mail senden' : 'Lieber mit Passwort anmelden'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
