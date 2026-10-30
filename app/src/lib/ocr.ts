import { createWorker, type Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null
let progressListener: ((p: number) => void) | null = null

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker(['deu', 'eng'], 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') progressListener?.(m.progress)
    },
  })
  return workerPromise
}

/** Handyfotos sind oft 4000 px breit – das macht die Erkennung langsam, nicht besser. */
const MAX_SIDE = 2400

/** Zeichnet das Foto verkleinert und um `angle` Grad gedreht auf eine Canvas. */
function drawRotated(bitmap: ImageBitmap, angle: 0 | 90 | 180 | 270): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const sideways = angle === 90 || angle === 270
  const canvas = document.createElement('canvas')
  canvas.width = sideways ? h : w
  canvas.height = sideways ? w : h
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((angle * Math.PI) / 180)
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
  return canvas
}

/** Bewertet, wie "lesbar" ein Ergebnis ist: echte Wörter × Erkennungssicherheit. */
export function readabilityScore(text: string, confidence: number): number {
  const words = text.match(/[a-zäöüß]{4,}/gi) ?? []
  return words.length * (confidence / 100)
}

// Ein Ergebnis mit Zutatenliste und genug Wörtern gilt als richtig herum.
const GOOD_ENOUGH = 25

/**
 * Liest den Text auf einem Foto (Deutsch + Englisch), komplett im Browser.
 * Seitlich oder kopfüber fotografierte Packungen werden automatisch gedreht.
 */
export async function recognizeText(image: Blob, onProgress?: (p: number) => void): Promise<string> {
  const worker = await getWorker()
  const bitmap = await createImageBitmap(image)
  const angles = [0, 90, 270, 180] as const
  let best = { text: '', score: -1 }
  try {
    for (const [i, angle] of angles.entries()) {
      progressListener = onProgress ? (p) => onProgress((i + p) / angles.length) : null
      const { data } = await worker.recognize(drawRotated(bitmap, angle))
      const score = readabilityScore(data.text, data.confidence)
      if (score > best.score) best = { text: data.text, score }
      if (/zutaten|ingredients/i.test(data.text) && score >= GOOD_ENOUGH) break
    }
  } finally {
    progressListener = null
    bitmap.close()
  }
  onProgress?.(1)
  return best.text
}

/** Schneidet den Zutatenblock aus dem erkannten Text heraus, falls erkennbar. */
export function extractIngredients(text: string): string | null {
  const m = text.match(
    /(zutaten|ingredients|ingr[ée]dients)\s*[:.]?\s*([\s\S]*?)(?=n[äa]hrwert|durchschnittliche|nutrition|mindestens haltbar|zu verbrauchen|aufbewahrung|$)/i,
  )
  return m ? m[2].trim() : null
}
