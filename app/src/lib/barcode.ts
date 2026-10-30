import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { isValidEan } from './ean'

interface DetectedBarcode {
  rawValue: string
}
declare global {
  // Shape Detection API (Chrome/Android, Safari ab iOS 17 teilweise)
  // eslint-disable-next-line no-var
  var BarcodeDetector:
    | (new (opts?: { formats: string[] }) => { detect(src: ImageBitmapSource): Promise<DetectedBarcode[]> })
    | undefined
}

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
  [
    DecodeHintType.POSSIBLE_FORMATS,
    // Nur EAN: In Tests las ZXing ein EAN-13 als falschen UPC-A mit gültiger Prüfziffer.
    // UPC-A-Codes werden vom EAN-13-Leser mit führender 0 trotzdem erkannt.
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8],
  ],
])

function toCanvas(bitmap: ImageBitmap, side: number, angle: 0 | 90): HTMLCanvasElement {
  const scale = side / Math.max(bitmap.width, bitmap.height)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = angle ? h : w
  canvas.height = angle ? w : h
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((angle * Math.PI) / 180)
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
  return canvas
}

/** Liest einen EAN/UPC-Barcode aus einem Foto. Liefert `null`, wenn keiner gefunden wurde. */
export async function decodeBarcode(image: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(image)
  try {
    if (globalThis.BarcodeDetector) {
      try {
        const detector = new globalThis.BarcodeDetector({
          formats: ['ean_13', 'ean_8'],
        })
        const code = (await detector.detect(bitmap)).find((c) => isValidEan(c.rawValue))
        if (code) return code.rawValue
      } catch {
        // Fallback unten
      }
    }
    // ZXing liest Striche nur quer zur Leserichtung – deshalb auch um 90° gedreht und
    // in mehreren Größen probieren (kleine Fotos hochskaliert, große verkleinert).
    const reader = new BrowserMultiFormatReader(hints)
    for (const size of [1600, 1000, 2400]) {
      for (const angle of [0, 90] as const) {
        try {
          const text = reader.decodeFromCanvas(toCanvas(bitmap, size, angle)).getText()
          if (isValidEan(text)) return text
        } catch {
          // nichts gefunden – nächste Variante
        }
      }
    }
    return null
  } finally {
    bitmap.close()
  }
}
