import { supabase } from '../../lib/supabase'
import { repository } from '../../lib/repository'

export interface FeedbackInput {
  message: string
  page: string | null
  email: string | null
}

export interface SendDeps {
  addFeedback(input: FeedbackInput): Promise<void>
  getToken(): Promise<string | null>
  post(token: string, input: FeedbackInput): Promise<boolean>
}

const defaultDeps: SendDeps = {
  addFeedback: (input) => repository.addFeedback(input),
  getToken: async () => (supabase ? ((await supabase.auth.getSession()).data.session?.access_token ?? null) : null),
  async post(token, { message, page }) {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, page }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null)
    return Boolean(res?.ok)
  },
}

/**
 * Feedback über zwei Wege ablegen: als Zeile in der Tabelle `feedback` und als GitHub-Issue (`/api/feedback`).
 * Es genügt, wenn ein Weg klappt; nur wenn beide scheitern, wird der Fehler der Datenbank gemeldet.
 */
export async function sendFeedback(input: FeedbackInput, deps: SendDeps = defaultDeps): Promise<{ database: boolean; issue: boolean }> {
  const issue = (async () => {
    const token = await deps.getToken()
    return token ? deps.post(token, input) : false
  })().catch(() => false)
  const db = deps.addFeedback(input).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  const [issueOk, dbResult] = await Promise.all([issue, db])
  if (!issueOk && !dbResult.ok) throw dbResult.error instanceof Error ? dbResult.error : new Error(String(dbResult.error))
  return { database: dbResult.ok, issue: issueOk }
}
