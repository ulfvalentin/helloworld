import { supabase } from '../../lib/supabase'

export interface FeedbackInput {
  message: string
  page: string | null
  email: string | null
}

export interface SendDeps {
  getToken(): Promise<string | null>
  post(token: string, input: FeedbackInput): Promise<{ ok: boolean; error?: string }>
}

const defaultDeps: SendDeps = {
  getToken: async () => (supabase ? ((await supabase.auth.getSession()).data.session?.access_token ?? null) : null),
  async post(token, { message, page }) {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, page }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null)
    if (!res) return { ok: false, error: 'Keine Verbindung. Bitte später noch einmal versuchen.' }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    return { ok: res.ok && body?.ok !== false, error: body?.error }
  },
}

/**
 * Sendet das Feedback an `/api/feedback`, das es als GitHub-Issue anlegt.
 * Wirft mit der Begründung der Funktion, wenn es nicht geklappt hat.
 */
export async function sendFeedback(input: FeedbackInput, deps: SendDeps = defaultDeps): Promise<void> {
  const token = await deps.getToken()
  if (!token) throw new Error('Bitte zuerst anmelden, um Feedback zu senden.')
  const result = await deps.post(token, input)
  if (!result.ok) throw new Error(result.error ?? 'Das Feedback konnte nicht gesendet werden.')
}
