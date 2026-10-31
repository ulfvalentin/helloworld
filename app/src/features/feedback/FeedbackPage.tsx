import { useState } from 'react'
import { CheckIcon } from '../../components/icons'
import { sendFeedback } from './sendFeedback'

const DRAFT_KEY = 'ws-feedback-draft'
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}
const writeDraft = (text: string) => {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // egal: der Entwurf ist nur eine Bequemlichkeit
  }
}

/**
 * Feedback senden: ein großes Freitextfeld, „Senden“ legt den Text als GitHub-Issue an (`/api/feedback`).
 * Diktieren geht über die Spracheingabe der Handy-Tastatur. Ein nicht gesendeter Entwurf bleibt im Browser erhalten.
 */
export function FeedbackPage({ email, page, onDone }: { email: string | null; page: string; onDone: () => void }) {
  const [text, setText] = useState(readDraft)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await sendFeedback({ message: text.trim(), page, email })
      writeDraft('')
      setText('')
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (sent)
    return (
      <div className="page stack" data-page="feedback">
        <h1>Danke!</h1>
        <p className="inline-status ok" role="status">
          <CheckIcon /> Dein Feedback ist angekommen.
        </p>
        <button type="button" className="primary" onClick={onDone}>
          Fertig
        </button>
        <button type="button" className="text-button" onClick={() => setSent(false)}>
          Noch etwas senden
        </button>
      </div>
    )

  return (
    <div className="page stack" data-page="feedback">
      <h1>Feedback senden</h1>
      <p className="muted">Fehler, Wünsche, Ideen – schreib einfach, was dir einfällt.</p>
      <label>
        Dein Feedback
        <textarea
          className="feedback-text"
          rows={12}
          value={text}
          maxLength={10000}
          onChange={(e) => {
            setText(e.target.value)
            writeDraft(e.target.value)
          }}
          autoFocus
        />
      </label>
      <button type="button" className="primary" onClick={send} disabled={busy || !text.trim()}>
        {busy ? 'Sende …' : 'Senden'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
