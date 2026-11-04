import { supabase } from './supabase'

/** Was die Bild-KI (`/api/read-label`) von den Fotos liest. Leere Felder: nicht auf den Fotos. */
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
  /** Offizielles Glutenfrei-Logo (durchgestrichene Ähre) gesehen */
  gluten_free_logo: boolean
  /** Lizenznummer am Logo, z. B. „DE-020-012“ */
  logo_license: string
  /** Aufdruck wie „glutenfrei“ */
  gluten_free_claim: string
}

/** `reading: null` → die App liest selbst (Texterkennung im Browser); `error` erklärt, warum. */
export interface LabelResult {
  reading: LabelReading | null
  error?: string
}

/** Lange Seite der Fotos für die Bild-KI: genug für kleine Schrift, aber kleine Uploads und geringe Kosten. */
const MAX_SIDE = 1600

async function toJpegBase64(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Foto konnte nicht verkleinert werden')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * Schickt die Fotos (verkleinert) an die Bild-KI. Ohne Anmeldung, ohne eingerichteten Schlüssel oder bei Fehlern
 * kommt `reading: null` zurück – die Prüfung liest die Fotos dann wie bisher im Browser.
 */
export async function readLabel(files: Blob[]): Promise<LabelResult> {
  if (!supabase || files.length === 0) return { reading: null }
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) return { reading: null }
  try {
    const images = await Promise.all(files.slice(0, 4).map(async (f) => ({ media_type: 'image/jpeg', data: await toJpegBase64(f) })))
    const res = await fetch('/api/read-label', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ images }),
      signal: AbortSignal.timeout(60000),
    })
    const body = (await res.json().catch(() => null)) as { ok?: boolean; reading?: LabelReading; error?: string } | null
    if (res.ok && body?.ok && body.reading) return { reading: body.reading }
    return { reading: null, error: body?.error ?? `Bild-KI nicht erreichbar (${res.status})` }
  } catch {
    return { reading: null, error: 'Bild-KI nicht erreichbar' }
  }
}
