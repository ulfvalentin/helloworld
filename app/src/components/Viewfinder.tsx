import { useEffect, useRef, useState } from 'react'
import { startLiveScan } from '../lib/liveBarcode'
import { CameraIcon, CheckIcon } from './icons'

type State = 'idle' | 'starting' | 'live' | 'found' | 'denied' | 'unavailable'

const REMEMBER = 'ws-camera-ok'
const remembered = () => {
  try {
    return localStorage.getItem(REMEMBER) === '1'
  } catch {
    return false
  }
}

/**
 * Barcode-Sucher: Kamerabild mit goldenen Ecken und Scan-Linie. Die Kamera startet sofort, wenn sie schon einmal
 * erlaubt wurde; sonst erklärt eine kurze Karte, wofür sie gebraucht wird (erst erklären, dann fragen).
 * Bei Ablehnung bleiben Eintippen und Galerie nutzbar.
 */
export function Viewfinder({ onCode, paused }: { onCode: (code: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [wanted, setWanted] = useState(remembered())
  const [state, setState] = useState<State>(remembered() ? 'starting' : 'idle')
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    if (!wanted || paused || !video.current) return
    let stop: (() => void) | null = null
    let cancelled = false
    startLiveScan(video.current, (code) => {
      setState('found')
      navigator.vibrate?.(60)
      onCodeRef.current(code)
    })
      .then((s) => {
        if (cancelled) return s()
        stop = s
        try {
          localStorage.setItem(REMEMBER, '1')
        } catch {
          // egal
        }
        setState((cur) => (cur === 'starting' ? 'live' : cur))
      })
      .catch((e: DOMException) => !cancelled && setState(e.name === 'NotAllowedError' ? 'denied' : 'unavailable'))
    return () => {
      cancelled = true
      stop?.()
    }
  }, [wanted, paused])

  if (state === 'idle')
    return (
      <div className="viewfinder viewfinder-info">
        <CameraIcon size={32} />
        <p>Für den Barcode-Scan braucht Wheat Shield deine Kamera. Das Bild bleibt auf deinem Gerät.</p>
        <button type="button" className="primary" onClick={() => {
            setState('starting')
            setWanted(true)
          }}>
          Kamera erlauben
        </button>
      </div>
    )
  if (state === 'denied' || state === 'unavailable')
    return (
      <div className="viewfinder viewfinder-info" role="status">
        <CameraIcon size={32} />
        <p>
          {state === 'denied'
            ? 'Kamera nicht erlaubt. Du kannst den Barcode unten eintippen oder ein Foto hochladen.'
            : 'Keine Kamera gefunden. Du kannst den Barcode unten eintippen oder ein Foto hochladen.'}
        </p>
      </div>
    )
  return (
    <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
      <div className="viewfinder">
        <video ref={video} muted playsInline aria-label="Kamerabild" />
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />
        {state === 'found' ? (
          <span className="live-chip">
            <CheckIcon size={16} /> Barcode erkannt
          </span>
        ) : (
          <span className="scan-line" />
        )}
      </div>
      <p className="muted small" role="status">
        {state === 'starting' ? 'Kamera startet …' : 'Barcode in den Rahmen halten'}
      </p>
    </div>
  )
}
