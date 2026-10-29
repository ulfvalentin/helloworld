import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="card">
      <h2>Anmelden</h2>
      {sent ? (
        <p>Wir haben dir einen Login-Link an {email} geschickt.</p>
      ) : (
        <form onSubmit={submit} className="stack">
          <label>
            E-Mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary">Login-Link senden</button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </div>
  )
}
