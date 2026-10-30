import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './authErrors'

describe('authErrorMessage', () => {
  it('übersetzt bekannte Supabase-Fehler', () => {
    expect(authErrorMessage('Invalid login credentials')).toBe('E-Mail oder Passwort stimmt nicht.')
    expect(authErrorMessage('email rate limit exceeded')).toMatch(/Zu viele E-Mails/)
    expect(authErrorMessage('Email not confirmed')).toMatch(/Auto Confirm User/)
    expect(authErrorMessage('Failed to fetch')).toMatch(/Keine Verbindung/)
  })
  it('lässt unbekannte Meldungen unverändert', () => {
    expect(authErrorMessage('Etwas anderes')).toBe('Etwas anderes')
  })
})
