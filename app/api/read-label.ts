// Liest Fotos einer Lebensmittelverpackung mit einer Bild-KI und gibt Produkt, Marke, Barcode-Ziffern und die
// Zutatenliste wörtlich zurück (POST /api/read-label). Deutlich zuverlässiger als die Texterkennung im Browser bei
// gebogenen, spiegelnden oder kleinen Etiketten. Nur für angemeldete Nutzer; Schlüssel liegen nur in Vercel:
// - GEMINI_API_KEY (Google AI Studio, kostenloses Kontingent) – wird bevorzugt, Modell per GEMINI_MODEL änderbar
// - ANTHROPIC_API_KEY (Claude, kostenpflichtig) – nur, wenn kein Gemini-Schlüssel gesetzt ist
// Ohne Schlüssel (503), bei Limits (429) oder Fehlern liest die App die Fotos wie bisher im Browser.
import Anthropic from '@anthropic-ai/sdk'
import { envMatching, json, verifyUser } from './_auth.js'

export interface LabelReading {
  product_name: string
  brand: string
  manufacturer: string
  barcode: string
  ingredients: string
  traces: string
  ingredients_complete: boolean
  unreadable: string[]
  websites: string[]
}

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 1_500_000
const MODEL = 'claude-opus-5-5'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['product_name', 'brand', 'manufacturer', 'barcode', 'ingredients', 'traces', 'ingredients_complete', 'unreadable', 'websites'],
  properties: {
    product_name: { type: 'string', description: 'Produktbezeichnung wie auf der Packung, sonst leer' },
    brand: { type: 'string', description: 'Marke (z. B. Bresso, Oatly), sonst leer' },
    manufacturer: { type: 'string', description: 'Hersteller/Inverkehrbringer mit Ort, sonst leer' },
    barcode: { type: 'string', description: 'Ziffern unter dem Strichcode ohne Leerzeichen, nur wenn vollständig lesbar, sonst leer' },
    ingredients: { type: 'string', description: 'Zutatenliste wörtlich, ohne das Wort "Zutaten:", ohne Spurenhinweis; leer, wenn keine Zutatenliste zu sehen ist' },
    traces: { type: 'string', description: 'Spurenhinweis wörtlich (z. B. "Kann Spuren von Sellerie enthalten."), sonst leer' },
    ingredients_complete: { type: 'boolean', description: 'true nur, wenn die Zutatenliste vollständig und sicher lesbar war' },
    unreadable: { type: 'array', items: { type: 'string' }, description: 'Stellen der Zutatenliste, die nicht sicher lesbar waren' },
    websites: { type: 'array', items: { type: 'string' }, description: 'Webadressen auf der Packung' },
  },
} as const

const SYSTEM = `Du liest Fotos von Lebensmittelverpackungen für eine App, die Menschen mit Zöliakie hilft.
Übertrage die Angaben exakt so, wie sie aufgedruckt sind. Erfinde, ergänze oder korrigiere nichts: Ein falsch gelesenes
Wort kann für Zöliakie-Betroffene gefährlich sein. Ist ein Wort nicht sicher lesbar, nimm es nicht in die Zutatenliste
auf, sondern trage die Stelle unter "unreadable" ein und setze "ingredients_complete" auf false.
Mehrsprachige Packungen: Nimm die deutsche Zutatenliste. Großschreibung (Allergene) darfst du normal schreiben.
Fehlt eine Angabe auf den Fotos, lass das Feld leer.`

export function isValidReading(r: unknown): r is LabelReading {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return ['product_name', 'brand', 'manufacturer', 'barcode', 'ingredients', 'traces'].every((k) => typeof o[k] === 'string') &&
    typeof o.ingredients_complete === 'boolean' && Array.isArray(o.unreadable) && Array.isArray(o.websites)
}

interface ImageInput {
  media_type: 'image/jpeg' | 'image/png' | 'image/webp'
  data: string
}

type Outcome = { status: number; body: Record<string, unknown> }
const PROMPT = 'Lies Produkt, Marke, Hersteller, Barcode-Ziffern, Zutatenliste und Spurenhinweis von diesen Fotos.'

/** JSON-Schema → Gemini-Schema (Typen in Großbuchstaben, ohne additionalProperties). */
function geminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: String(schema.type).toUpperCase() }
  if (schema.description) out.description = schema.description
  if (schema.properties)
    out.properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(([k, v]) => [k, geminiSchema(v)]),
    )
  if (schema.items) out.items = geminiSchema(schema.items as Record<string, unknown>)
  if (schema.required) out.required = schema.required
  return out
}

const GEMINI_MODELS = () => [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash'].filter((m): m is string => Boolean(m))

async function readWithGemini(images: ImageInput[], apiKey: string): Promise<Outcome> {
  const request = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: [...images.map((i) => ({ inline_data: { mime_type: i.media_type, data: i.data } })), { text: PROMPT }],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: geminiSchema(SCHEMA as unknown as Record<string, unknown>),
    },
  }
  for (const model of GEMINI_MODELS()) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(50000),
    }).catch(() => null)
    if (!res) return { status: 502, body: { ok: false, error: 'Bild-KI nicht erreichbar' } }
    if (res.status === 404) continue // Modellname unbekannt – nächsten versuchen
    if (res.status === 429) return { status: 429, body: { ok: false, error: 'Kostenloses Gemini-Kontingent gerade erschöpft' } }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message
      return { status: 503, body: { ok: false, error: `Gemini lehnt die Anfrage ab (${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''})` } }
    }
    if (!res.ok) return { status: 502, body: { ok: false, error: `Bild-KI nicht verfügbar (${res.status})` } }
    const data = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    } | null
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    let reading: unknown = null
    try {
      reading = text ? JSON.parse(text) : null
    } catch {
      reading = null
    }
    if (!isValidReading(reading)) return { status: 502, body: { ok: false, error: 'Unerwartete Antwort der Bild-KI' } }
    return { status: 200, body: { ok: true, reading, model } }
  }
  return { status: 503, body: { ok: false, error: 'Kein passendes Gemini-Modell gefunden (GEMINI_MODEL prüfen)' } }
}

async function readWithClaude(images: ImageInput[], apiKey: string): Promise<Outcome> {
  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Lesen ist keine schwere Denkaufgabe: niedrige Effort-Stufe hält Wartezeit und Kosten klein
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // Lehnt die Sicherheitsprüfung eine Anfrage ab, übernimmt automatisch ein Ersatzmodell
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.media_type, data: i.data } })),
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })
    if (response.stop_reason === 'refusal') return { status: 422, body: { ok: false, error: 'Die Fotos konnten nicht ausgewertet werden' } }
    const text = response.content.find((b) => b.type === 'text')
    const reading: unknown = text && text.type === 'text' ? JSON.parse(text.text) : null
    if (!isValidReading(reading)) return { status: 502, body: { ok: false, error: 'Unerwartete Antwort der Bild-KI' } }
    return { status: 200, body: { ok: true, reading, model: MODEL } }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { status: 429, body: { ok: false, error: 'Zu viele Anfragen – gleich noch einmal versuchen' } }
    if (e instanceof Anthropic.AuthenticationError) return { status: 503, body: { ok: false, error: 'Der Anthropic-Schlüssel in Vercel ist ungültig' } }
    if (e instanceof Anthropic.APIError) return { status: 502, body: { ok: false, error: `Bild-KI nicht verfügbar (${e.status ?? 'Fehler'})` } }
    return { status: 502, body: { ok: false, error: 'Bild-KI nicht erreichbar' } }
  }
}

/** Gemini-Schlüssel: jede Variable mit „gemini“ im Namen (außer GEMINI_MODEL), oder GOOGLE_API_KEY. */
export function geminiKey(env: Record<string, string | undefined> = process.env): string | undefined {
  return envMatching(/^(?!.*model)(.*gemini.*|google_(ai_|genai_)?api_key)$/i, env)
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'POST erwartet' }, 405)
    const gemini = geminiKey()
    const anthropic = envMatching(/^anthropic(_api)?_key$/i)
    if (!gemini && !anthropic)
      return json({ ok: false, configured: false, error: 'Kein Schlüssel für die Bild-KI in Vercel (GEMINI_API_KEY)' }, 503)
    if ((await verifyUser(request)) === false) return json({ ok: false, error: 'Nicht angemeldet' }, 401)

    const body = (await request.json().catch(() => null)) as { images?: ImageInput[] } | null
    const images = (body?.images ?? []).filter(
      (i) => /^image\/(jpeg|png|webp)$/.test(i?.media_type) && typeof i.data === 'string' && i.data.length * 0.75 <= MAX_IMAGE_BYTES,
    )
    if (images.length === 0 || images.length > MAX_IMAGES) return json({ ok: false, error: '1 bis 4 Fotos erwartet' }, 400)

    const outcome = gemini ? await readWithGemini(images, gemini) : await readWithClaude(images, anthropic!)
    return json(outcome.body, outcome.status)
  },
}
