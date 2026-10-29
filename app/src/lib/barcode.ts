import { BrowserMultiFormatReader } from '@zxing/browser'

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

/** Liest einen EAN/UPC-Barcode aus einem Foto. Liefert `null`, wenn keiner gefunden wurde. */
export async function decodeBarcode(image: Blob): Promise<string | null> {
  if (globalThis.BarcodeDetector) {
    try {
      const detector = new globalThis.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
      })
      const bitmap = await createImageBitmap(image)
      const codes = await detector.detect(bitmap)
      if (codes[0]) return codes[0].rawValue
    } catch {
      // Fallback unten
    }
  }
  const url = URL.createObjectURL(image)
  try {
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url)
    return result.getText()
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
