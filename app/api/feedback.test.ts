import { afterEach, describe, expect, it, vi } from 'vitest'
import handler, { githubToken, issueBody, issueTitle } from './feedback'

const post = (body: unknown, token?: string) =>
  new Request('https://x.test/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GITHUB_TOKEN
  delete process.env.Github_Feedback
})

describe('issueTitle / issueBody', () => {
  it('kürzt den Titel und nimmt nur die erste Zeile', () => {
    expect(issueTitle('Kurz\nZweite Zeile')).toBe('Feedback: Kurz')
    expect(issueTitle('x'.repeat(100)).length).toBeLessThanOrEqual(81)
  })
  it('zitiert den Text und entschärft @-Erwähnungen', () => {
    const b = issueBody('Hallo @octocat\nZeile 2', { page: 'scan', email: 'a@b.de', userAgent: 'UA', at: '2026-10-31T00:00:00Z' })
    expect(b).toContain('> Hallo @​octocat')
    expect(b).toContain('> Zeile 2')
    expect(b).toContain('Gesendet von: a@​b.de'.replace('a@​b', 'a@b'))
    expect(b).toContain('Bildschirm: scan')
  })
})

describe('githubToken', () => {
  it('findet GITHUB_TOKEN oder GITHUB_FEEDBACK in beliebiger Schreibweise', () => {
    expect(githubToken({ GITHUB_TOKEN: 'a' })).toBe('a')
    expect(githubToken({ Github_Feedback: ' b ' })).toBe('b')
    expect(githubToken({ GITHUB_FEEDBACK_TOKEN: 'c' })).toBe('c')
    expect(githubToken({ GITHUB_TOKEN: '', OTHER: 'x' })).toBeUndefined()
  })
})

describe('POST /api/feedback', () => {
  it('503 ohne GITHUB_TOKEN', async () => {
    const res = await handler.fetch(post({ message: 'x' }, 't'))
    expect(res.status).toBe(503)
  })

  it('401 ohne gültige Anmeldung', async () => {
    process.env.GITHUB_TOKEN = 'gh'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    expect((await handler.fetch(post({ message: 'x' }))).status).toBe(401)
    expect((await handler.fetch(post({ message: 'x' }, 'schlecht'))).status).toBe(401)
  })

  it('legt bei gültiger Anmeldung ein Issue mit Label an', async () => {
    process.env.GITHUB_TOKEN = 'gh'
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes('/auth/v1/user')
        ? Response.json({ email: 'ulf@example.com' })
        : Response.json({ html_url: 'https://github.com/o/r/issues/1' }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await handler.fetch(post({ message: 'Dunkelmodus bitte', page: 'scan' }, 'good'))
    expect(await res.json()).toEqual({ ok: true, url: 'https://github.com/o/r/issues/1' })
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.github.com'))!
    const sent = JSON.parse((call[1] as RequestInit).body as string)
    expect(sent.labels).toEqual(['feedback'])
    expect(sent.title).toBe('Feedback: Dunkelmodus bitte')
    expect(sent.body).toContain('ulf@example.com')
    expect(((call[1] as RequestInit).headers as Record<string, string>).authorization).toBe('Bearer gh')
  })

  it('akzeptiert den Token auch unter dem Namen Github_Feedback', async () => {
    process.env.Github_Feedback = 'gh'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/auth/v1/user') ? Response.json({ email: 'a@b.de' }) : Response.json({ html_url: 'u' }, { status: 201 }))))
    expect((await handler.fetch(post({ message: 'hi' }, 'good'))).status).toBe(200)
  })

  it('meldet GitHubs Begründung, wenn das Issue abgelehnt wird', async () => {
    process.env.GITHUB_TOKEN = 'gh'
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/auth/v1/user') ? Response.json({ email: 'a@b.de' }) : Response.json({ message: 'Resource not accessible by personal access token' }, { status: 403 }),
    ))
    const res = await handler.fetch(post({ message: 'hi' }, 'good'))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('GitHub hat das Feedback nicht angenommen (403: Resource not accessible by personal access token)')
  })

  it('versucht es ohne Label, wenn GitHub das Label ablehnt', async () => {
    process.env.GITHUB_TOKEN = 'gh'
    const bodies: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/auth/v1/user')) return Response.json({ email: 'a@b.de' })
      const sent = JSON.parse(init!.body as string)
      bodies.push(sent)
      return sent.labels ? Response.json({ message: 'Resource not accessible by personal access token' }, { status: 403 }) : Response.json({ html_url: 'u' }, { status: 201 })
    }))
    const res = await handler.fetch(post({ message: 'hi' }, 'good'))
    expect(res.status).toBe(200)
    expect(bodies).toHaveLength(2)
  })

  it('weist leeren und zu langen Text ab', async () => {
    process.env.GITHUB_TOKEN = 'gh'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ email: 'a@b.de' })))
    expect((await handler.fetch(post({ message: '  ' }, 'good'))).status).toBe(400)
    expect((await handler.fetch(post({ message: 'x'.repeat(5001) }, 'good'))).status).toBe(413)
  })
})
