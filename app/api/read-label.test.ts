import { afterEach, describe, expect, it, vi } from 'vitest'
import handler, { geminiKey } from './read-label'

const reading = {
  product_name: 'Kräuter der Provence', brand: 'Bresso', manufacturer: '', barcode: '4000400008053',
  ingredients: 'FRISCHKÄSE, BUTTER', traces: 'Kann Spuren von Sellerie enthalten.', ingredients_complete: true, unreadable: [], websites: [],
}
const post = (body: unknown) =>
  new Request('https://x.test/api/read-label', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer good' }, body: JSON.stringify(body) })
const photo = { media_type: 'image/jpeg', data: 'aGVsbG8=' }

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GEMINI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
})

function stub(gemini: (url: string, init?: RequestInit) => Response) {
  const f = vi.fn(async (url: string, init?: RequestInit) => (url.includes('/auth/v1/user') ? Response.json({ email: 'a@b.de' }) : gemini(url, init)))
  vi.stubGlobal('fetch', f)
  return f
}

describe('geminiKey', () => {
  it('findet den Schlüssel unter üblichen Namen, nicht GEMINI_MODEL', () => {
    expect(geminiKey({ GEMINI_API_KEY: 'a' })).toBe('a')
    expect(geminiKey({ Gemini_Studio: 'b' })).toBe('b')
    expect(geminiKey({ GOOGLE_API_KEY: 'c' })).toBe('c')
    expect(geminiKey({ GEMINI_MODEL: 'gemini-x' })).toBeUndefined()
  })
})

describe('POST /api/read-label (Gemini)', () => {
  it('503 ohne Schlüssel', async () => {
    expect((await handler.fetch(post({ images: [photo] }))).status).toBe(503)
  })

  it('schickt Fotos als inline_data mit JSON-Schema und gibt die Lesung zurück', async () => {
    process.env.GEMINI_API_KEY = 'g'
    const f = stub(() => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reading) }] } }] }))
    const res = await handler.fetch(post({ images: [photo] }))
    expect(res.status).toBe(200)
    expect((await res.json()).reading).toEqual(reading)
    const call = f.mock.calls.find((c) => String(c[0]).includes('generativelanguage'))!
    expect(String(call[0])).toContain('gemini-flash-latest:generateContent')
    const sent = JSON.parse(call[1]!.body as string)
    expect(sent.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'aGVsbG8=' } })
    expect(sent.generationConfig.responseSchema.type).toBe('OBJECT')
    expect(sent.generationConfig.responseSchema.properties.unreadable).toEqual({ type: 'ARRAY', items: { type: 'STRING' }, description: expect.any(String) })
    expect((call[1]!.headers as Record<string, string>)['x-goog-api-key']).toBe('g')
  })

  it('unbekanntes Modell: nächstes Modell versuchen', async () => {
    process.env.GEMINI_API_KEY = 'g'
    const f = stub((url) =>
      url.includes('gemini-flash-latest') ? new Response('{}', { status: 404 }) : Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reading) }] } }] }),
    )
    const res = await handler.fetch(post({ images: [photo] }))
    expect(res.status).toBe(200)
    expect(f.mock.calls.some((c) => String(c[0]).includes('gemini-2.5-flash'))).toBe(true)
  })

  it('Kontingent erschöpft: 429 (App liest dann im Browser)', async () => {
    process.env.GEMINI_API_KEY = 'g'
    stub(() => new Response('{}', { status: 429 }))
    expect((await handler.fetch(post({ images: [photo] }))).status).toBe(429)
  })

  it('kaputte Antwort: 502', async () => {
    process.env.GEMINI_API_KEY = 'g'
    stub(() => Response.json({ candidates: [{ content: { parts: [{ text: '{"x":1}' }] } }] }))
    expect((await handler.fetch(post({ images: [photo] }))).status).toBe(502)
  })
})
