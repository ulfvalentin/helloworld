import { useEffect, useRef, useState } from 'react'
import { UserIcon } from './icons'

/** Personen-Icon oben rechts; öffnet ein kleines Menü mit E-Mail-Adresse und „Abmelden“. */
export function AccountMenu({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="account" ref={root}>
      <button
        type="button"
        className="icon-button"
        aria-label="Konto"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <UserIcon size={24} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {email && <p className="menu-email">{email}</p>}
          <button type="button" role="menuitem" onClick={onSignOut}>
            Abmelden
          </button>
        </div>
      )}
    </div>
  )
}
