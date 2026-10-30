import { describe, expect, it } from 'vitest'
import { parseDate, parseEmail } from './parseEmail'

const FORWARD = `Hallo Wheat Shield,

---------- Weitergeleitete Nachricht ----------
Von: Kundenservice <service@kattus.de>
Gesendet: Montag, 12. Oktober 2026 10:15
An: ich@example.com
Betreff: AW: Anfrage zu Kattus Bio Haferflocken

Sehr geehrter Herr Valentin,

vielen Dank für Ihre Anfrage. Unsere Bio Haferflocken sind glutenfrei und werden in einer separaten Linie hergestellt.

Mit freundlichen Grüßen
Theodor Kattus GmbH

Am 10.10.2026 schrieb Ulf:
> Ist das Produkt glutenfrei?
`

describe('parseEmail', () => {
  it('liest eine Weiterleitung: Hersteller, Produkt, Datum, Aussage', () => {
    const r = parseEmail(FORWARD)
    expect(r.manufacturer).toBe('Theodor Kattus GmbH')
    expect(r.product).toBe('Kattus Bio Haferflocken')
    expect(r.date).toBe('2026-10-12')
    expect(r.verdict).toBe('yes')
    expect(r.fromEmail).toBe('service@kattus.de')
    expect(r.quote).toMatch(/glutenfrei/)
  })

  it('liest eine .eml mit Kopfzeilen und Quoted-Printable', () => {
    const eml = `From: "Info" <info@beispiel-mühle.de>
Subject: =?UTF-8?Q?AW:_Frage_zu_Dinkelnudeln?=
Date: Tue, 3 Nov 2026 09:00:00 +0100
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

Unsere Dinkelnudeln enthalten Gluten, da Dinkel ein glutenhaltiges Getreide ist.
`
    const r = parseEmail(eml)
    expect(r.subject).toBe('Frage zu Dinkelnudeln')
    expect(r.product).toBe('Dinkelnudeln')
    expect(r.date).toBe('2026-11-03')
    expect(r.verdict).toBe('no')
  })

  it('Frage im zitierten Teil zählt nicht; ohne klare Aussage → unclear', () => {
    const r = parseEmail('Betreff: Antwort\n\nVielen Dank für Ihr Interesse, wir melden uns.\n\n> Ist es glutenfrei?')
    expect(r.verdict).toBe('unclear')
  })

  it('Spuren und Kreuzkontamination → nicht bestätigt', () => {
    expect(parseEmail('Es kann zu Spuren von Weizen kommen.').verdict).toBe('no')
    expect(parseEmail('Wir können Glutenfreiheit leider nicht garantieren.').verdict).toBe('no')
  })

  it('erkennt einen gültigen Barcode', () => {
    expect(parseEmail('Produkt: Reis\nEAN 4023900545644 ist glutenfrei.').barcode).toBe('4023900545644')
    expect(parseEmail('Nummer 1234567890123').barcode).toBeNull()
  })

  it('Datumsformate', () => {
    expect(parseDate('12.03.2026')).toBe('2026-03-12')
    expect(parseDate('Montag, 12. März 2026 10:15')).toBe('2026-03-12')
    expect(parseDate('Tue, 3 Nov 2026 09:00:00 +0100')).toBe('2026-11-03')
  })
})
