/** Übersetzt Fehlermeldungen von Supabase Auth in verständliches Deutsch. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-Mail oder Passwort stimmt nicht.'
  if (m.includes('email not confirmed'))
    return 'Die E-Mail-Adresse ist noch nicht bestätigt. Beim Anlegen des Nutzers in Supabase „Auto Confirm User“ anhaken.'
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('over_email_send_rate_limit'))
    return 'Zu viele E-Mails in kurzer Zeit. Bitte etwa eine Stunde warten oder mit Passwort anmelden.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Keine Verbindung. Bitte Internet prüfen und erneut versuchen.'
  return message
}
