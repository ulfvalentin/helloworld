import { createWorker, type Worker } from 'tesseract.js'
import type { OcrLine } from './textClean'

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
/** Zur Orientierungssuche reicht eine kleine Fassung: Ob Text aufrecht steht, sieht man auch in 900 px. */
const PROBE_SIDE = 900

/** Lädt Erkennungs-Worker und Sprachdaten schon vor dem ersten Foto (spart ca. 5 s beim Prüfen). */
export function warmUp(): void {
  void getWorker().catch(() => {
    workerPromise = null
  })
}

/** Zeichnet das Foto verkleinert und um `angle` Grad gedreht auf eine Canvas. */
function drawRotated(bitmap: ImageBitmap, angle: 0 | 90 | 180 | 270, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
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

/** Ab diesem Wert (in der kleinen Fassung) steht ein Foto sicher aufrecht – weitere Drehungen entfallen. */
const UPRIGHT_PROBE_SCORE = 6

export interface OcrResult {
  text: string
  /** Zeilen mit Sicherheit pro Wort – Grundlage fürs Aufräumen */
  lines: OcrLine[]
}

const cache = new WeakMap<Blob, Promise<OcrResult>>()

async function recognizeOnce(image: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  const worker = await getWorker()
  const bitmap = await createImageBitmap(image)
  const report = (from: number, to: number) => {
    progressListener = onProgress ? (p) => onProgress(from + (to - from) * p) : null
  }
  try {
    // 1) Orientierung in kleiner Fassung bestimmen. Aufrechte Fotos (der Normalfall) brauchen nur eine Probe.
    let bestAngle: 0 | 90 | 180 | 270 = 0
    let bestScore = -1
    const probeAngles = [0, 90, 270, 180] as const
    for (const [i, angle] of probeAngles.entries()) {
      report(0.3 * (i / probeAngles.length), 0.3 * ((i + 1) / probeAngles.length))
      const { data } = await worker.recognize(drawRotated(bitmap, angle, PROBE_SIDE))
      const score = readabilityScore(data.text, data.confidence)
      if (score > bestScore) {
        bestScore = score
        bestAngle = angle
      }
      if (score >= UPRIGHT_PROBE_SCORE) break
    }
    // 2) Ein einziger Durchgang in voller Auflösung, richtig herum
    report(0.3, 1)
    const { data } = await worker.recognize(drawRotated(bitmap, bestAngle, MAX_SIDE), {}, { text: true, blocks: true })
    const lines = (data.blocks ?? []).flatMap((b) =>
      b.paragraphs.flatMap((p) =>
        p.lines.map((l) => ({ words: l.words.map((w) => ({ text: w.text, confidence: w.confidence })) })),
      ),
    )
    return { text: data.text, lines }
  } finally {
    progressListener = null
    bitmap.close()
  }
}

/**
 * Liest den Text auf einem Foto (Deutsch + Englisch), komplett im Browser.
 * Seitlich oder kopfüber fotografierte Packungen werden automatisch gedreht.
 * Ergebnisse werden pro Foto gemerkt (z. B. wenn weitere Fotos nachgereicht werden).
 */
export async function recognizeText(image: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  let pending = cache.get(image)
  if (!pending) {
    pending = recognizeOnce(image, onProgress)
    cache.set(image, pending)
    pending.catch(() => cache.delete(image))
  }
  const result = await pending
  onProgress?.(1)
  return result
}
