import type { DecodeHintType } from '@zxing/library'
import { isValidEan } from './ean'

/**
 * Liest Barcodes live aus der Kamera. Ruft `onCode` einmal je erkanntem, gültigem EAN auf.
 * Liefert eine Funktion, die Kamera und Erkennung beendet. Wirft, wenn die Kamera nicht startet
 * (`NotAllowedError`: abgelehnt, `NotFoundError`: keine Kamera).
 */
export async function startLiveScan(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Keine Kamera-Unterstützung', 'NotSupportedError')
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  video.srcObject = stream
  video.setAttribute('playsinline', 'true')
  await video.play().catch(() => undefined)

  let stopped = false
  let done = false
  const found = (code: string) => {
    if (stopped || done || !isValidEan(code)) return
    done = true
    onCode(code)
  }
  // Nur das eigene Bild abräumen: Bei schnellem Neustart (z. B. React StrictMode) hängt am Video schon der nächste Stream
  const stopStream = () => {
    stream.getTracks().forEach((t) => t.stop())
    if (video.srcObject === stream) video.srcObject = null
  }

  if (globalThis.BarcodeDetector) {
    const detector = new globalThis.BarcodeDetector({ formats: ['ean_13', 'ean_8'] })
    const timer = setInterval(async () => {
      if (stopped || video.readyState < 2) return
      try {
        const hit = (await detector.detect(video)).find((c) => isValidEan(c.rawValue))
        if (hit) found(hit.rawValue)
      } catch {
        // einzelne Bilder dürfen scheitern
      }
    }, 150)
    return () => {
      stopped = true
      clearInterval(timer)
      stopStream()
    }
  }

  // Fallback: ZXing liest einzelne Bilder aus dem Video (Safari ohne BarcodeDetector, Firefox)
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType: Hint }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const hints = new Map<DecodeHintType, unknown>([[Hint.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]]])
  const reader = new BrowserMultiFormatReader(hints)
  const canvas = document.createElement('canvas')
  const timer = setInterval(() => {
    if (stopped || video.readyState < 2 || !video.videoWidth) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    try {
      found(reader.decodeFromCanvas(canvas).getText())
    } catch {
      // kein Barcode im Bild
    }
  }, 200)
  return () => {
    stopped = true
    clearInterval(timer)
    stopStream()
  }
}
