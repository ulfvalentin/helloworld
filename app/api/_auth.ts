// Gemeinsame Anmeldeprüfung der Vercel-Funktionen (Dateien mit „_“ werden nicht als eigene Route ausgeliefert).
// Das Supabase-Zugangstoken der App wird beim Supabase-Projekt geprüft. URL und Publishable Key sind öffentlich
// (stehen auch in .env.production); in der Testumgebung kommen sie aus den Vercel-Variablen.

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://jvjkvydixrwxmdhadxge.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_XFAKLhYRwJK-byA-VlDi8Q_XgcVTe-4'

/** E-Mail des angemeldeten Nutzers (oder `null` ohne E-Mail); `false`, wenn das Token nicht gültig ist. */
export async function verifyUser(request: Request): Promise<string | null | false> {
  const token = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!token) return false
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(6000),
  }).catch(() => null)
  if (!res?.ok) return false
  const user = (await res.json().catch(() => null)) as { email?: string } | null
  return user ? (user.email ?? null) : false
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** Wert einer Umgebungsvariable, deren Name zum Muster passt (Groß-/Kleinschreibung egal). */
export function envMatching(pattern: RegExp, env: Record<string, string | undefined> = process.env): string | undefined {
  const key = Object.keys(env).find((k) => pattern.test(k) && env[k]?.trim())
  return key ? env[key]!.trim() : undefined
}
