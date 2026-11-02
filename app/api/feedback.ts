// Feedback aus der App als GitHub-Issue ablegen (Vercel-Funktion, POST /api/feedback).
// Nur angemeldete Nutzer: Das Supabase-Zugangstoken wird beim Projekt geprüft. Der GitHub-Token liegt nur
// als Umgebungsvariable GITHUB_TOKEN (oder GITHUB_FEEDBACK) in Vercel (nie im Code). Ohne Token antwortet die Funktion mit 503,
// die App meldet das dann als Fehler.

import { envMatching, json, verifyUser } from './_auth'

const REPO = process.env.FEEDBACK_REPO ?? 'ulfvalentin/helloworld'

/** GitHub-Token aus der Umgebung: `GITHUB_TOKEN` oder `GITHUB_FEEDBACK` (Groß-/Kleinschreibung egal). */
export function githubToken(env: Record<string, string | undefined> = process.env): string | undefined {
  return envMatching(/^github_(token|feedback)(_token)?$/i, env)
}

export interface FeedbackRequest {
  message: string
  page: string | null
}

const MAX_LENGTH = 5000

/** `@name` würde Personen auf GitHub benachrichtigen – unscharf machen. */
const defuseMentions = (s: string) => s.replace(/@(?=\w)/g, '@\u200b')

/** Titel: erste Zeile, gekürzt. */
export function issueTitle(message: string): string {
  const first = message.trim().split(/\r?\n/)[0].replace(/\s+/g, ' ')
  return `Feedback: ${first.length > 70 ? first.slice(0, 67) + '…' : first}`
}

export function issueBody(
  message: string,
  meta: { page: string | null; email: string | null; userAgent: string | null; at: string; env?: string | null },
): string {
  const quoted = defuseMentions(message.trim()).split(/\r?\n/).map((l) => `> ${l}`).join('\n')
  const lines = [
    quoted,
    '',
    '---',
    `Gesendet von: ${meta.email ?? 'unbekannt'}`,
    `Bildschirm: ${meta.page ?? 'unbekannt'}`,
    ...(meta.env ? [`Umgebung: ${meta.env}`] : []),
    `Zeit: ${meta.at}`,
    meta.userAgent ? `Browser: ${meta.userAgent.slice(0, 200)}` : '',
  ]
  return lines.filter((l, i) => l !== '' || i === 1).join('\n')
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'POST erwartet' }, 405)
    const ghToken = githubToken()
    if (!ghToken) return json({ ok: false, configured: false, error: 'GITHUB_TOKEN (oder GITHUB_FEEDBACK) ist in Vercel nicht gesetzt' }, 503)

    const email = await verifyUser(request)
    if (email === false) return json({ ok: false, error: 'Nicht angemeldet' }, 401)

    const body = (await request.json().catch(() => null)) as Partial<FeedbackRequest> | null
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!message) return json({ ok: false, error: 'Leeres Feedback' }, 400)
    if (message.length > MAX_LENGTH) return json({ ok: false, error: 'Feedback zu lang' }, 413)

    const page = typeof body?.page === 'string' ? body.page.slice(0, 40) : null
    const issue = {
      title: issueTitle(message),
      body: issueBody(message, {
        page,
        email,
        userAgent: request.headers.get('user-agent'),
        at: new Date().toISOString(),
        // Feedback aus der Testumgebung kenntlich machen (Vercel setzt VERCEL_ENV)
        env: process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' ? 'Test' : null,
      }),
    }
    const create = (withLabel: boolean) =>
      fetch(`https://api.github.com/repos/${REPO}/issues`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ghToken}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'wheat-shield-feedback',
        },
        body: JSON.stringify(withLabel ? { ...issue, labels: ['feedback'] } : issue),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null)
    // Das Label „feedback“ anzulegen oder zu setzen kann an Token-Rechten scheitern – dann ohne Label versuchen
    let res = await create(true)
    if (res && (res.status === 403 || res.status === 422)) res = await create(false)
    if (!res?.ok) {
      // GitHubs Begründung (z. B. fehlende Token-Rechte) durchreichen, damit sie in der App sichtbar ist
      const detail = res ? ((await res.json().catch(() => null)) as { message?: string } | null)?.message : 'keine Verbindung'
      return json({ ok: false, error: `GitHub hat das Feedback nicht angenommen (${res?.status ?? 'Fehler'}${detail ? `: ${String(detail).slice(0, 160)}` : ''})` }, 502)
    }
    const created = (await res.json().catch(() => null)) as { html_url?: string } | null
    return json({ ok: true, url: created?.html_url ?? null })
  },
}
