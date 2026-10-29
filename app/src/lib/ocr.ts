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

/** Liest den Text auf einem Foto (Deutsch + Englisch), komplett im Browser. */
export async function recognizeText(image: Blob, onProgress?: (p: number) => void): Promise<string> {
  const worker = await getWorker()
  progressListener = onProgress ?? null
  try {
    const { data } = await worker.recognize(image)
    return data.text
  } finally {
    progressListener = null
  }
}

/** Schneidet den Zutatenblock aus dem erkannten Text heraus, falls erkennbar. */
export function extractIngredients(text: string): string | null {
  const m = text.match(
    /(zutaten|ingredients|ingr[ée]dients)\s*[:.]?\s*([\s\S]*?)(?=n[äa]hrwert|nutrition|mindestens haltbar|zu verbrauchen|aufbewahrung|$)/i,
  )
  return m ? m[2].trim() : null
}
