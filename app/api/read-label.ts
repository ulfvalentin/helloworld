// Liest Fotos einer Lebensmittelverpackung mit Claude (Bild-KI) und gibt Produkt, Marke, Barcode-Ziffern und die
// Zutatenliste wörtlich zurück (POST /api/read-label). Deutlich zuverlässiger als die Texterkennung im Browser bei
// gebogenen, spiegelnden oder kleinen Etiketten. Nur für angemeldete Nutzer; der API-Schlüssel liegt nur in Vercel
// (ANTHROPIC_API_KEY). Ohne Schlüssel antwortet die Funktion mit 503 und die App liest wie bisher im Browser.
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

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'POST erwartet' }, 405)
    const apiKey = envMatching(/^anthropic(_api)?_key$/i)
    if (!apiKey) return json({ ok: false, configured: false, error: 'ANTHROPIC_API_KEY ist in Vercel nicht gesetzt' }, 503)
    if ((await verifyUser(request)) === false) return json({ ok: false, error: 'Nicht angemeldet' }, 401)

    const body = (await request.json().catch(() => null)) as { images?: ImageInput[] } | null
    const images = (body?.images ?? []).filter(
      (i) => /^image\/(jpeg|png|webp)$/.test(i?.media_type) && typeof i.data === 'string' && i.data.length * 0.75 <= MAX_IMAGE_BYTES,
    )
    if (images.length === 0 || images.length > MAX_IMAGES) return json({ ok: false, error: '1 bis 4 Fotos erwartet' }, 400)

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
              { type: 'text', text: 'Lies Produkt, Marke, Hersteller, Barcode-Ziffern, Zutatenliste und Spurenhinweis von diesen Fotos.' },
            ],
          },
        ],
      })
      if (response.stop_reason === 'refusal') return json({ ok: false, error: 'Die Fotos konnten nicht ausgewertet werden' }, 422)
      const text = response.content.find((b) => b.type === 'text')
      const reading: unknown = text && text.type === 'text' ? JSON.parse(text.text) : null
      if (!isValidReading(reading)) return json({ ok: false, error: 'Unerwartete Antwort der Bild-KI' }, 502)
      return json({ ok: true, reading })
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ ok: false, error: 'Zu viele Anfragen – gleich noch einmal versuchen' }, 429)
      if (e instanceof Anthropic.AuthenticationError) return json({ ok: false, error: 'Der Anthropic-Schlüssel in Vercel ist ungültig' }, 503)
      if (e instanceof Anthropic.APIError) return json({ ok: false, error: `Bild-KI nicht verfügbar (${e.status ?? 'Fehler'})` }, 502)
      return json({ ok: false, error: 'Bild-KI nicht erreichbar' }, 502)
    }
  },
}
