import { CameraIcon, ImageUpIcon } from './icons'

/** Zwei Buttons: Kamera öffnen oder Fotos aus der Galerie wählen. */
export function PhotoButtons({ onPick, disabled }: { onPick: (files: File[]) => void; disabled?: boolean }) {
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = '' // dieselbe Datei darf erneut gewählt werden
    if (picked.length > 0) onPick(picked)
  }
  return (
    <div className="photo-buttons">
      {/* mit capture öffnet das Handy die Kamera, ohne die Galerie (iOS bietet beides nie zugleich an) */}
      <label className="photo-button">
        <CameraIcon /> Foto aufnehmen
        <input type="file" accept="image/*" capture="environment" onChange={pick} hidden disabled={disabled} />
      </label>
      <label className="photo-button secondary">
        <ImageUpIcon /> Foto hochladen
        <input type="file" accept="image/*" multiple onChange={pick} hidden disabled={disabled} />
      </label>
    </div>
  )
}
