/** Prüft die EAN-Prüfziffer, damit Lesefehler nicht als Barcode durchgehen. */
export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/**
 * Sucht EAN-13-Nummern im erkannten Text (die Ziffern unter dem Barcode), falls der
 * Strichcode selbst nicht lesbar war. Die Texterkennung streut oft Leerzeichen,
 * Anführungszeichen oder eine doppelte Ziffer ein – deshalb werden alle 13-stelligen
 * Fenster mit gültiger Prüfziffer geliefert. Etwa jedes zehnte zufällige Fenster
 * besteht die Prüfziffer, darum müssen Kandidaten per Datenbank bestätigt werden.
 */
export function eanCandidatesFromText(text: string): string[] {
  const out: string[] = []
  for (const run of text.match(/\d[\d\s"'’‘|.,]{11,24}\d/g) ?? []) {
    const digits = run.replace(/\D/g, '')
    for (let i = 0; i + 13 <= digits.length; i++) {
      const c = digits.slice(i, i + 13)
      if (isValidEan(c) && !out.includes(c)) out.push(c)
    }
  }
  return out
}
