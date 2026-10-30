/**
 * Liest eine E-Mail eines Herstellers (eingefügter Text, .eml oder Weiterleitung) und erkennt Hersteller, Produkt,
 * Datum und die Aussage zu Gluten. Das Ergebnis ist ein Vorschlag; der Nutzer prüft es vor dem Speichern.
 */
export interface ParsedEmail {
  subject: string | null
  fromName: string | null
  fromEmail: string | null
  /** ISO-Datum (YYYY-MM-DD) der Herstellerantwort; null, wenn keines gefunden wurde */
  date: string | null
  /** Text der Herstellerantwort ohne Zitate und Signaturketten */
  body: string
  manufacturer: string | null
  product: string | null
  barcode: string | null
  /** yes: glutenfrei bestätigt · no: nicht bestätigt/Spuren · unclear: keine eindeutige Aussage */
  verdict: 'yes' | 'no' | 'unclear'
  /** Satz, aus dem die Aussage abgeleitet wurde */
  quote: string | null
}

const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
const FREE_MAIL = /^(gmail|googlemail|web|gmx|t-online|outlook|hotmail|yahoo|icloud|freenet|posteo|mail|live|me)\./i
const COMPANY = /([\p{Lu}][\p{L}0-9&.\-]*(?:[ \t]+[\p{L}0-9&.\-]+){0,3}?[ \t]+(?:GmbH[ \t]*&[ \t]*Co\.?[ \t]*KG|GmbH|AG|KG|SE|e\.\s?K\.|OHG|UG))/u

const pad = (n: number) => String(n).padStart(2, '0')

function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = []
  const t = s.replace(/=\r?\n/g, '')
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) {
      bytes.push(parseInt(t.slice(i + 1, i + 3), 16))
      i += 2
    } else bytes.push(...new TextEncoder().encode(t[i]))
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
}

function decodeBase64(s: string): string {
  try {
    const bin = atob(s.replace(/\s+/g, ''))
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return s
  }
}

function decodeWords(s: string): string {
  return s.replace(/=\?([\w-]+)\?([BQbq])\?([^?]*)\?=/g, (_m, _cs, enc: string, text: string) =>
    enc.toUpperCase() === 'B' ? decodeBase64(text) : decodeQuotedPrintable(text.replace(/_/g, ' ')),
  )
}

function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü').replace(/&szlig;/g, 'ß')
    .replace(/[ \t]+/g, ' ')
}

function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/)
    if (m) headers[m[1].toLowerCase()] ??= decodeWords(m[2])
  }
  return headers
}

function decodePart(headers: Record<string, string>, body: string): string {
  const enc = (headers['content-transfer-encoding'] ?? '').toLowerCase()
  const text = enc === 'base64' ? decodeBase64(body) : enc === 'quoted-printable' ? decodeQuotedPrintable(body) : body
  return /text\/html/i.test(headers['content-type'] ?? '') ? stripHtml(text) : text
}

/** Zerlegt eine .eml in Kopfzeilen und lesbaren Text. Reiner Text ohne Kopfzeilen bleibt unverändert. */
function readMessage(raw: string): { headers: Record<string, string>; text: string } {
  const text = raw.replace(/^﻿/, '')
  const split = text.search(/\r?\n\r?\n/)
  const head = split >= 0 ? text.slice(0, split) : ''
  if (!/^(From|Von|Date|Subject|Received|MIME-Version|Return-Path|Message-ID|Content-Type):/im.test(head.split(/\r?\n/)[0] ?? ''))
    return { headers: {}, text }
  const headers = parseHeaders(head)
  const body = text.slice(split).replace(/^\s+/, '')
  const boundary = (headers['content-type'] ?? '').match(/boundary="?([^";\s]+)"?/i)?.[1]
  if (!boundary) return { headers, text: decodePart(headers, body) }
  const parts = body.split('--' + boundary).slice(1).map((p) => {
    const i = p.search(/\r?\n\r?\n/)
    const h = parseHeaders(p.slice(0, i))
    return { h, text: decodePart(h, p.slice(i).trim()) }
  })
  const plain = parts.find((p) => /text\/plain/i.test(p.h['content-type'] ?? ''))
  const any = plain ?? parts.find((p) => /text\/html/i.test(p.h['content-type'] ?? ''))
  return { headers, text: any?.text ?? '' }
}

/** Datum aus „Mon, 12 Mar 2026 …“, „12. März 2026“ oder „12.03.2026“. */
export function parseDate(s: string): string | null {
  const num = s.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/)
  if (num) return `${num[3]}-${pad(+num[2])}-${pad(+num[1])}`
  const word = s.match(/\b(\d{1,2})\.?\s+([A-Za-zäÄ]+)\.?,?\s+(\d{4})\b/)
  if (word) {
    const m = MONTHS.findIndex((n) => word[2].toLowerCase().startsWith(n.slice(0, 3)))
    if (m >= 0) return `${word[3]}-${pad(m + 1)}-${pad(+word[1])}`
  }
  const t = Date.parse(s)
  if (!Number.isNaN(t)) {
    const d = new Date(t)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  return null
}

const FORWARD_FROM = /^\s*(?:-{2,}.*-{2,}\s*)?(?:Von|From):\s*(.+)$/im

/** Weitergeleitete Mail: Kopfblock („Von: … Gesendet: … Betreff: …“) und Text danach. */
function readForwarded(text: string) {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const from = lines[i].match(FORWARD_FROM)
    if (!from) continue
    const block = lines.slice(i, i + 8)
    const field = (re: RegExp) => block.map((l) => l.match(re)?.[1]?.trim()).find(Boolean) ?? null
    const subject = field(/^\s*(?:Betreff|Subject):\s*(.+)$/i)
    const date = field(/^\s*(?:Gesendet|Datum|Date|Sent):\s*(.+)$/i)
    if (!subject && !date) continue
    let end = i + 1
    while (end < lines.length && /^\s*(Von|From|An|To|Cc|Gesendet|Datum|Date|Sent|Betreff|Subject):/i.test(lines[end])) end++
    return { from: from[1].trim(), subject, date, rest: lines.slice(end).join('\n') }
  }
  return null
}

/** Schneidet zitierte Vorgängermails und Signaturketten ab. */
function cutQuotes(text: string): string {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) continue
    if (/^\s*(Am .{5,80}schrieb|On .{5,80}wrote|-{2,}\s*(Ursprüngliche Nachricht|Original Message|Weitergeleitete Nachricht)|Von:\s.+\s*$)/i.test(line) && out.length > 2) break
    out.push(line)
  }
  // Anrede („Sehr geehrter Herr …,“) ist nicht Teil der Aussage
  return out.join('\n').replace(/^\s*(?:Sehr geehrte[^\n]*|Hallo[^\n]*|Guten Tag[^\n]*|Liebe[^\n]*)\n/i, '').trim()
}

function sentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter(Boolean)
}

const NEGATIVE = [
  /\bnicht\b[^.]{0,40}\bglutenfrei/i,
  /\bkein(?:e|en)?\b[^.]{0,20}\bglutenfrei/i,
  /nicht\b[^.]{0,30}\b(?:garantieren|bestätigen|ausschließen|zusichern)/i,
  /\b(?:enthält|enthalten)\b[^.]{0,30}\b(?:gluten|weizen|gerste|roggen|hafer|dinkel)/i,
  /\bspuren\b[^.]{0,40}\b(?:gluten|weizen|gerste|roggen|hafer|dinkel)/i,
  /\bkreuzkontamination\b/i,
  /\bnot gluten[- ]free\b|\bcontains gluten\b/i,
]
const POSITIVE = [
  /\b(?:ist|sind|wird|werden)\b[^.]{0,40}\bglutenfrei/i,
  /\bglutenfrei(?:es|er|e|en)?\b[^.]{0,30}\b(?:hergestellt|produziert|ist|sind)/i,
  /\b(?:keine|ohne|frei von)\b[^.]{0,25}\bgluten/i,
  /\bgluten[- ]?frei\b/i,
  /\bis gluten[- ]free\b/i,
]

function judge(text: string): Pick<ParsedEmail, 'verdict' | 'quote'> {
  const list = sentences(text).filter((s) => !s.endsWith('?'))
  const hit = (res: RegExp[]) => list.find((s) => res.some((r) => r.test(s)))
  const neg = hit(NEGATIVE)
  if (neg) return { verdict: 'no', quote: neg }
  const pos = hit(POSITIVE)
  return pos ? { verdict: 'yes', quote: pos } : { verdict: 'unclear', quote: null }
}

function ean(text: string): string | null {
  for (const m of text.matchAll(/\b(\d{13})\b/g)) {
    const d = [...m[1]].map(Number)
    const sum = d.slice(0, 12).reduce((a, n, i) => a + n * (i % 2 ? 3 : 1), 0)
    if ((10 - (sum % 10)) % 10 === d[12]) return m[1]
  }
  return null
}

const stripPrefix = (s: string) => s.replace(/^\s*((AW|RE|WG|FW|FWD|Antwort|Weitergeleitet)\s*:\s*)+/i, '').trim()

function findProduct(subject: string | null, body: string): string | null {
  const clean = (s: string) => s.replace(/^[„"“'\s]+|[“"”'.,:;\s]+$/g, '').replace(/\s+/g, ' ')
  const fromBody =
    body.match(/Produkt(?:name|bezeichnung)?\s*:\s*(.+)/i)?.[1] ??
    body.match(/(?:Produkt|Artikel)\s+[„"“]([^“"”\n]{3,80})[“"”]/i)?.[1] ??
    body.match(/[„"“]([^“"”\n]{3,80})[“"”]/)?.[1]
  if (fromBody) return clean(fromBody)
  const sub = subject ? stripPrefix(subject) : ''
  const fromSubject = sub.match(/(?:anfrage|frage|rückfrage|nachfrage|information(?:en)?|auskunft)?\s*(?:zu|zum|zur|bzgl\.?|betreffend|betr\.?|über)\s+(.{3,100})/i)?.[1]
  return clean(fromSubject ?? sub) || null
}

function findManufacturer(body: string, fromName: string | null, fromEmail: string | null): string | null {
  // Grußformel gehört nicht zum Firmennamen („Mit freundlichen Grüßen Theodor Kattus GmbH“)
  const plain = body.replace(/^.*\b(?:Grüßen|Grüße|Gruß|Regards)\b[,\s]*/gim, '')
  const company = plain.match(COMPANY)?.[1] ?? fromName?.match(COMPANY)?.[1]
  if (company) return company.replace(/\s+/g, ' ').trim()
  const domain = fromEmail?.split('@')[1]
  if (domain && !FREE_MAIL.test(domain)) {
    const name = domain.replace(/^(www|mail|info|service)\./, '').split('.')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  return fromName
}

function parseAddress(s: string | null | undefined): { name: string | null; email: string | null } {
  if (!s) return { name: null, email: null }
  const email = s.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? null
  const name = s.replace(/<[^>]*>/g, '').replace(email ?? '', '').replace(/["'()]/g, '').trim() || null
  return { name, email }
}

export function parseEmail(raw: string): ParsedEmail {
  const { headers, text } = readMessage(raw)
  const fwd = readForwarded(text)
  const address = parseAddress(fwd?.from ?? headers.from)
  const subject = fwd?.subject ?? headers.subject ?? null
  const body = cutQuotes(fwd?.rest ?? text)
  const dateSource = fwd?.date ?? headers.date ?? ''
  const date = (dateSource && parseDate(dateSource)) || null
  const { verdict, quote } = judge(body)
  return {
    subject: subject ? stripPrefix(subject) : null,
    fromName: address.name,
    fromEmail: address.email,
    date,
    body,
    manufacturer: findManufacturer(body, address.name, address.email),
    product: findProduct(subject, body),
    barcode: ean(`${subject ?? ''}\n${body}`),
    verdict,
    quote,
  }
}
