// Vercel Function: sucht Produktinformationen (Zutaten, Gluten-Aussagen) auf der Website des
// Herstellers. Läuft serverlos, weil der Browser fremde Websites wegen CORS nicht lesen darf.
//
//   GET /api/product-info?brand=Bamboo%20Garden&name=Pad%20Thai&barcode=4023900545644&url=https://…
//
// Alles steckt bewusst in einer Datei: Vercel bündelt jede Datei in api/ einzeln.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export interface ProductInfoQuery {
  name?: string
  brand?: string
  barcode?: string
  /** Webadressen von der Verpackung */
  urls: string[]
  /** Sicher gelesene Zutatenwörter vom Foto – Seiten mit passender Zutatenliste sind das Produkt */
  hints?: string[]
}

export interface ProductInfoResult {
  found: boolean
  sourceUrl: string | null
  title: string | null
  ingredients: string | null
  /** Sätze der Seite, die Gluten erwähnen („Alle unsere Nudeln sind glutenfrei.“) */
  glutenStatements: string[]
  allergens: string | null
  /** false: Produkt nicht nachweislich dasselbe (nur Zutatenwörter passen) oder ähnliche Varianten mit gleichen Gluten-Zutaten */
  exact: boolean
  /** Besuchte Adressen, zur Nachvollziehbarkeit */
  checked: string[]
  message: string
}

interface Ctx {
  deadline: number
  fetches: number
  checked: string[]
}

const USER_AGENT = 'Mozilla/5.0 (compatible; WheatShield/0.1; Produktinformationen fuer Zoeliakie)'
const DEADLINE_MS = 9000
const MAX_FETCHES = 40
const MAX_BYTES = 1_500_000
const ACCEPT_SCORE = 2

// ------------------------------------------------------------------ Sicherheit (SSRF)

/** Private, Loopback- und Link-Local-Adressen dürfen nie abgerufen werden. */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase()
  const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) return isPrivateAddress(dotted[1])
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v)
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < maxBytes) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  await reader.cancel().catch(() => {})
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.length
  }
  const charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Ruft eine öffentliche Webseite ab: nur http(s), keine internen Adressen, begrenzte Größe/Zeit. */
async function safeFetch(rawUrl: string, ctx: Ctx): Promise<{ url: string; text: string } | null> {
  let url = rawUrl
  for (let hop = 0; hop < 4; hop++) {
    if (ctx.fetches >= MAX_FETCHES || Date.now() > ctx.deadline - 300) return null
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return null
    }
    if (!/^https?:$/.test(u.protocol) || u.username || (u.port && u.port !== '80' && u.port !== '443')) return null
    const host = u.hostname.replace(/^\[|\]$/g, '')
    try {
      const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
      if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) return null
    } catch {
      return null
    }
    ctx.fetches++
    ctx.checked.push(u.toString())
    let res: Response
    try {
      res = await fetch(u, {
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'de,en;q=0.8', accept: 'text/html,*/*;q=0.5' },
        signal: AbortSignal.timeout(Math.max(500, Math.min(5000, ctx.deadline - Date.now()))),
      })
    } catch {
      return null
    }
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, u).toString()
      continue
    }
    if (!res.ok || !/text\/|xml/.test(res.headers.get('content-type') ?? '')) return null
    try {
      return { url: u.toString(), text: await readLimited(res, MAX_BYTES) }
    } catch {
      return null
    }
  }
  return null
}

// ------------------------------------------------------------------ Seite auswerten

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', shy: '', euro: '€', reg: '®',
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m)
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|ul|ol|table|dd|dt|dl|td|th)\s*>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

const SECTION_END =
  /^(n[äa]hrwert|durchschnittliche|brennwert|nutrition|allergen|aufbewahr|lager|trocken\b|k[üu]hl|haltbar|hergestellt|herkunft|inhalt|zubereitung|kochanweisung|verwendung|hinweis|energie)/i

/** Zutatenliste aus dem Seitentext: Überschrift „Zutaten“ + die folgende Aufzählung. */
export function extractIngredients(text: string): string | null {
  const heading = /(?:^|\n)\s*(?:zutaten|zusammensetzung|ingredients)[^\n:]{0,25}(?::\s*|\n)/gi
  for (const m of text.matchAll(heading)) {
    const rest = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1500)
    const lines: string[] = []
    for (const line of rest.split('\n')) {
      if (lines.length > 0 && SECTION_END.test(line.trim())) break
      if (line.trim()) lines.push(line.trim())
      if (lines.join(' ').length > 900 || lines.length >= 6) break
    }
    const joined = lines
      .join(' ')
      .replace(/\s+/g, ' ')
      // Überschriften wiederholen sich oft („Zutatenliste Zutaten: …“) und danach folgt anderes Seitenmaterial
      .replace(/^(?:(?:zutatenliste|zutaten|zusammensetzung|ingredients)\s*:?\s*)+/i, '')
      .split(/\s(?=(?:Information|F[üu]llmenge|Gebinde|N[äa]hrwert|Durchschnittliche|Allergen|Brennwert|Aufbewahr|Lagerung|Zubereitung|Kochanweisung)\w*)/i)[0]
      .trim()
    // Echte Zutatenlisten haben mehrere Einträge
    if ((joined.match(/,/g) ?? []).length >= 1 && joined.length >= 12) return joined.slice(0, 900)
    if (/^[\p{L}\s-]{4,40}\.?$/u.test(joined) && lines.length === 1) return joined // z. B. „Reismehl“
  }
  return null
}

export function extractGlutenStatements(text: string): string[] {
  const found: string[] = []
  for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
    let s = sentence.trim()
    const at = s.search(/gluten/i)
    if (at < 0) continue
    if (s.length > 110) {
      // Lange oder zusammengeschobene Seitenelemente: nur den Ausschnitt um „Gluten“ behalten
      const from = Math.max(0, at - 45)
      s = s.slice(from, at + 60)
      if (from > 0) s = s.replace(/^\S*\s/, '')
      s = s.replace(/\s\S*$/, '')
    }
    // Beim Kürzen kann „Gluten“ am abgeschnittenen Rand verloren gehen
    if (s.length >= 8 && /gluten/i.test(s) && !found.includes(s)) found.push(s)
  }
  // Aussagen, die in einer längeren enthalten sind, entfallen
  return found.filter((s) => !found.some((o) => o !== s && o.toLowerCase().includes(s.toLowerCase()))).slice(0, 3)
}

export function extractAllergens(text: string): string | null {
  const m = /allergen(?:hinweis|e|information(?:en)?)?[^:\n]{0,30}:\s*([^\n]{3,300})/i.exec(text)
  return m ? m[1].trim() : null
}

interface Page {
  url: string
  title: string
  h1: string
  text: string
  ingredients: string | null
  glutenStatements: string[]
  allergens: string | null
  links: { href: string; label: string }[]
}

export function parsePage(url: string, html: string): Page {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim()
  const h1 = htmlToText(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '')
  // Barcodes stehen manchmal nur in den strukturierten Daten (schema.org Product, gtin13)
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .join(' ')
  const text = htmlToText(html) + '\n' + jsonLd
  const links: Page['links'] = []
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const href = new URL(decodeEntities(m[1]), url).toString()
      if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4)(\?|$)/i.test(href)) continue
      links.push({ href, label: htmlToText(m[2]) })
    } catch {
      // ungültiger Link
    }
  }
  const plain = htmlToText(html)
  return {
    url,
    title,
    h1,
    text,
    ingredients: extractIngredients(plain),
    glutenStatements: extractGlutenStatements(plain),
    allergens: extractAllergens(plain),
    links,
  }
}

// ------------------------------------------------------------------ Relevanz

const STOPWORDS = new Set(['der', 'die', 'das', 'und', 'mit', 'von', 'für', 'the', 'and', 'bio', 'aus', 'ohne'])

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')

// Endungen abschneiden, damit „Reisnudeln“ und „Reisnudel“ zusammenpassen
const stem = (t: string) => (t.length > 5 ? t.replace(/(en|er|n|e|s)$/, '') : t)

/** Bedeutungstragende Wörter (Wortstämme) des Produktnamens ohne die Marke. */
export function nameTokens(name?: string, brand?: string): string[] {
  const brandWords = new Set(normalize(brand ?? '').split(/[^a-z0-9]+/))
  return [
    ...new Set(
      normalize(name ?? '')
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !brandWords.has(t))
        .map(stem),
    ),
  ]
}

export function brandSlug(brand?: string): string {
  return normalize((brand ?? '').split(/[,;/]/)[0]).replace(/[^a-z0-9]/g, '')
}

/**
 * Ist die Seite *nachweislich* dieses Produkt? Nur Barcode oder Produktname beweisen das –
 * übereinstimmende Zutatenwörter allein zeigen höchstens ein ähnliches Produkt.
 */
export function isIdentified(page: Page, q: ProductInfoQuery): boolean {
  if (q.barcode && page.text.replace(/\D/g, ' ').includes(q.barcode)) return true
  const tokens = nameTokens(q.name, q.brand)
  if (tokens.length === 0) return false
  const head = normalize(`${page.title} ${page.h1} ${page.url}`)
  return tokens.filter((t) => head.includes(t)).length / tokens.length >= 0.75
}

/** Wie sicher ist, dass die Seite genau dieses Produkt beschreibt? */
export function relevance(page: Page, q: ProductInfoQuery): number {
  let score = 0
  if (q.barcode && page.text.replace(/\D/g, ' ').includes(q.barcode)) score += 3
  const tokens = nameTokens(q.name, q.brand)
  if (tokens.length > 0) {
    const head = normalize(`${page.title} ${page.h1} ${page.url}`)
    const body = normalize(page.text.slice(0, 4000))
    const inHead = tokens.filter((t) => head.includes(t)).length / tokens.length
    const inBody = tokens.filter((t) => body.includes(t)).length / tokens.length
    score += inHead * 2 + inBody * 0.5
  }
  // Stimmen die vom Foto gelesenen Zutatenwörter mit der Zutatenliste der Seite überein, ist es dasselbe Produkt
  const hints = (q.hints ?? []).map(normalize).filter((h) => h.length >= 4)
  if (hints.length >= 3 && page.ingredients) {
    const list = normalize(page.ingredients)
    const ratio = hints.filter((h) => list.includes(h)).length / hints.length
    // Allein anhand der Zutatenwörter zählt nur eine (fast) vollständige Übereinstimmung: Ein ähnliches
    // Produkt (z. B. Haferdrink vs. Hafercreme) teilt die meisten Wörter, aber nicht alle.
    score += ratio >= 0.9 ? 3 : ratio
  }
  const slug = brandSlug(q.brand)
  if (slug && normalize(`${page.title} ${page.text.slice(0, 3000)}`).replace(/[^a-z0-9]/g, '').includes(slug)) score += 0.5
  return score
}

const GLUTEN_WORDS = /weizen|roggen|gerste|hafer|dinkel|kamut|khorasan|emmer|einkorn|triticale|malz|gluten|wheat|rye|barley|\boats?\b|spelt/g

/** Welche glutenrelevanten Zutaten nennt die Liste? (grob, nur zum Vergleichen von Seiten) */
export function glutenSignature(ingredients: string): string {
  return [...new Set(normalize(ingredients).match(GLUTEN_WORDS) ?? [])].sort().join(',')
}

/**
 * Beste passende Seite. Gibt es mehrere gleich gute Treffer mit unterschiedlichen Zutaten
 * (z. B. Haferdrink und Barista), ist das Produkt nicht eindeutig:
 * - unterscheiden sie sich bei den glutenrelevanten Zutaten → nichts übernehmen (falsche Zutaten
 *   wären bei Zöliakie schlimmer als keine),
 * - sonst den besten übernehmen, aber als „nicht exakt“ kennzeichnen.
 */
export function pickBest(
  pages: Page[],
  q: ProductInfoQuery,
): { hit: { page: Page; score: number } | null; ambiguous: boolean; exact: boolean } {
  const ranked = pages
    .map((page) => ({ page, score: relevance(page, q) }))
    .filter((r) => r.page.ingredients && r.score >= ACCEPT_SCORE)
    .sort((a, b) => b.score - a.score)
  const first = ranked[0]
  if (!first) return { hit: null, ambiguous: false, exact: true }
  const others = ranked.filter(
    (r) =>
      normalize(r.page.ingredients ?? '') !== normalize(first.page.ingredients ?? '') && first.score - r.score < 0.5,
  )
  if (others.length === 0) return { hit: first, ambiguous: false, exact: isIdentified(first.page, q) }
  const sig = glutenSignature(first.page.ingredients ?? '')
  if (others.some((r) => glutenSignature(r.page.ingredients ?? '') !== sig)) return { hit: null, ambiguous: true, exact: true }
  return { hit: first, ambiguous: false, exact: false }
}

// ------------------------------------------------------------------ Suche

const registrable = (host: string) => host.replace(/^www\./, '')

function candidateSites(q: ProductInfoQuery): string[] {
  const out = [...q.urls]
  const slug = brandSlug(q.brand)
  if (slug) for (const tld of ['de', 'com']) out.push(`https://www.${slug}.${tld}/`)
  return [...new Set(out)].slice(0, 5)
}

function resultLinks(html: string): string[] {
  const urls: string[] = []
  const add = (href: string) => {
    try {
      const u = new URL(decodeEntities(href), 'https://duckduckgo.com')
      const target = u.searchParams.get('uddg') ?? u.toString()
      if (/^https?:/.test(target) && !/duckduckgo\.com/.test(target) && !urls.includes(target)) urls.push(target)
    } catch {
      // ungültiger Treffer
    }
  }
  for (const a of html.matchAll(/<a\s[^>]*class=["'][^"']*result(?:__a|-link)[^"']*["'][^>]*>/g)) {
    const href = /href=["']([^"']+)["']/.exec(a[0])?.[1]
    if (href) add(href)
  }
  return urls
}

/** Websuche über DuckDuckGo (ohne API-Schlüssel); die Suche ist gelegentlich gedrosselt, daher zwei Wege. */
async function webSearch(query: string, ctx: Ctx): Promise<string[]> {
  for (const endpoint of ['https://html.duckduckgo.com/html/', 'https://lite.duckduckgo.com/lite/']) {
    const res = await safeFetch(`${endpoint}?q=${encodeURIComponent(query)}`, ctx)
    const urls = res ? resultLinks(res.text) : []
    if (urls.length > 0) return urls
  }
  return []
}

export async function findProductInfo(q: ProductInfoQuery): Promise<ProductInfoResult> {
  const ctx: Ctx = { deadline: Date.now() + DEADLINE_MS, fetches: 0, checked: [] }
  const tokens = nameTokens(q.name, q.brand)
  const canMatch = Boolean(q.barcode) || tokens.length > 0 || (q.hints?.length ?? 0) >= 3
  const seen = new Set<string>()
  const pages: Page[] = []

  const visit = async (url: string): Promise<Page | null> => {
    if (seen.has(url)) return null
    seen.add(url)
    const res = await safeFetch(url, ctx)
    if (!res) return null
    const page = parsePage(res.url, res.text)
    pages.push(page)
    return page
  }
  const best = () => pickBest(pages, q).hit
  const done = (): ProductInfoResult => {
    const { hit, ambiguous, exact } = pickBest(pages, q)
    if (hit) {
      return {
        found: true,
        sourceUrl: hit.page.url,
        title: hit.page.h1 || hit.page.title || null,
        ingredients: hit.page.ingredients,
        glutenStatements: hit.page.glutenStatements,
        allergens: hit.page.allergens,
        exact,
        checked: ctx.checked,
        message: exact
          ? 'Zutaten auf der Hersteller-Website gefunden.'
          : 'Passende Zutaten gefunden, aber das Produkt ist nicht eindeutig bestimmt – bitte mit der Packung vergleichen.',
      }
    }
    return {
      found: false,
      sourceUrl: null,
      title: null,
      ingredients: null,
      glutenStatements: [],
      allergens: null,
      exact: true,
      checked: ctx.checked,
      message: ambiguous
        ? 'Mehrere ähnliche Produkte gefunden – bitte den Produktnamen eintragen und erneut prüfen.'
        : canMatch
          ? 'Auf der Hersteller-Website wurde keine passende Zutatenliste gefunden.'
          : 'Zum Suchen fehlen Produktname oder Barcode.',
    }
  }
  if (!canMatch) return done()

  // 1) Bekannte Adressen: von der Verpackung, geratene Hersteller-Domains
  const sites = candidateSites(q)
  await Promise.all(sites.map(visit))
  if (best()) return done()

  // 2) Von dort auf passende Produktseiten weiterklicken
  const linkScore = (l: { href: string; label: string }) => {
    const hay = normalize(`${l.label} ${decodeURIComponent(l.href)}`)
    return tokens.filter((t) => hay.includes(t)).length + (/produkt|product/.test(hay) ? 0.2 : 0)
  }
  const follow = pages
    .flatMap((p) =>
      p.links
        .filter((l) => registrable(new URL(l.href).hostname) === registrable(new URL(p.url).hostname))
        .map((l) => ({ ...l, score: linkScore(l) })),
    )
    .filter((l) => l.score >= 1)
    .sort((a, b) => b.score - a.score)
  await Promise.all([...new Set(follow.map((l) => l.href))].slice(0, 3).map(visit))
  if (best()) return done()

  // 2b) Produktübersichten durchblättern (Kategorie → Produktseiten) und anhand von Barcode bzw.
  // Zutatenwörtern vom Foto vergleichen. Funktioniert ohne Websuche und ohne bekannten Produktnamen.
  if (q.barcode || (q.hints?.length ?? 0) >= 3) {
    const sameSite = (p: Page) =>
      p.links.filter((l) => registrable(new URL(l.href).hostname) === registrable(new URL(p.url).hostname))
    // Bereiche ohne Produktdaten ausklammern, damit das Abrufbudget für Produktseiten reicht
    const NOT_PRODUCTS = /sustainab|climate|nachhaltig|about|who|career|job|press|legal|datenschutz|privacy|impressum|kontakt|contact|faq|news|blog|recipe|rezept|store|login|cart|warenkorb/i
    const productLinks = () =>
      [
        ...new Set(
          pages
            .flatMap(sameSite)
            .filter((l) => {
              const path = new URL(l.href).pathname
              return /produkt|product|sortiment/i.test(path) && !NOT_PRODUCTS.test(path)
            })
            .map((l) => l.href.split('#')[0]),
        ),
      ].filter((h) => !seen.has(h))
    const depth = (h: string) => new URL(h).pathname.split('/').filter(Boolean).length
    // Deutsche Seiten zuerst: Die englische Variante nennt die Zutaten oft anders und wird nicht erkannt.
    const german = (h: string) => {
      const u = new URL(h)
      return /^\/de([-_/]|$)/i.test(u.pathname) || u.hostname.endsWith('.de') ? 0 : 1
    }
    // In kleinen Gruppen abrufen, um die Hersteller-Seite nicht zu überlasten
    const visitAll = async (urls: string[], concurrency = 6) => {
      for (let i = 0; i < urls.length && !best(); i += concurrency) await Promise.all(urls.slice(i, i + concurrency).map(visit))
    }
    // erst Übersichten (flach), dann die darin verlinkten Produktseiten (tief)
    await visitAll(productLinks().sort((a, b) => german(a) - german(b) || depth(a) - depth(b)).slice(0, 4))
    if (!best()) await visitAll(productLinks().sort((a, b) => german(a) - german(b) || depth(b) - depth(a)).slice(0, 24))
    if (best()) return done()
  }

  // 3) Suche auf der Hersteller-Seite, dann Websuche
  const distinctive = [...(q.hints ?? [])].sort((a, b) => b.length - a.length).slice(0, 3)
  const query = [q.brand?.split(',')[0], q.name ?? distinctive.join(' ')].filter(Boolean).join(' ')
  const hosts = [...new Set(pages.map((p) => new URL(p.url).origin))].slice(0, 1)
  for (const origin of hosts) {
    if (query) await visit(`${origin}/?s=${encodeURIComponent(query)}`)
  }
  const searchHits = await webSearch(`${query || q.barcode} Zutaten`, ctx)
  const slug = brandSlug(q.brand)
  const manufacturerHits = searchHits
    .filter((u) => {
      try {
        const host = normalize(new URL(u).hostname).replace(/[^a-z0-9]/g, '')
        return (slug && host.includes(slug)) || sites.some((s) => registrable(new URL(s).hostname) === registrable(new URL(u).hostname))
      } catch {
        return false
      }
    })
    .slice(0, 3)
  await Promise.all(manufacturerHits.map(visit))
  return done()
}

// ------------------------------------------------------------------ HTTP

const clean = (v: string | null, max = 120) => (v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) || undefined

export default {
  async fetch(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams
    const query: ProductInfoQuery = {
      name: clean(params.get('name')),
      brand: clean(params.get('brand')),
      barcode: clean(params.get('barcode'), 14)?.replace(/\D/g, '') || undefined,
      urls: params
        .getAll('url')
        .map((u) => clean(u, 300))
        .filter((u): u is string => Boolean(u))
        .slice(0, 4),
      hints: params
        .getAll('hint')
        .map((h) => clean(h, 30))
        .filter((h): h is string => Boolean(h))
        .slice(0, 12),
    }
    const result = await findProductInfo(query)
    return Response.json(result, {
      headers: { 'cache-control': result.found ? 'public, s-maxage=86400' : 'no-store' },
    })
  },
}
