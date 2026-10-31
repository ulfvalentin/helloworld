# E-Mail-Import

Eine Herstellerantwort per E-Mail wird als Herstellerbestätigung zu einem Produkt abgelegt.

## Ablauf
1. Nav „E-Mail“: Text der Mail einfügen (auch weitergeleitet) oder `.eml` hochladen.
2. `parseEmail` erkennt Hersteller (Firmenname in der Signatur, sonst Absender-Domain), Produkt (Betreff, „Produkt: …“,
   Anführungszeichen), Barcode (13 Ziffern mit gültiger Prüfziffer), Datum (Kopfzeile bzw. „Gesendet:“ der weitergeleiteten Mail)
   und die Aussage (glutenfrei bestätigt / nicht bestätigt / unklar). Zitierte Vorgängermails und Fragen zählen nicht.
3. Vorschau: alles ist editierbar. Passende vorhandene Produkte (Barcode, Namensähnlichkeit) werden vorgeschlagen, sonst „Neues Produkt anlegen“.
4. Speichern legt (falls neu) das Produkt an und fügt die Bestätigung mit Datum, Kontakt und Wortlaut hinzu. Die Einstufung
   „Sicher glutenfrei lt. Hersteller“ gilt dann 6 Monate ab Datum der Mail.

5. Danach wird immer die Herstellerseite befragt (`completeProduct.ts`): Fehlen dem Eintrag Zutaten oder Produktfoto, werden sie ergänzt –
   nur von einer Seite, die nachweislich dasselbe Produkt zeigt, und ohne vorhandene Angaben zu überschreiben. Das Foto ist die Bild-Adresse
   der Herstellerseite (schema.org/og:image). Ein Satz auf der Produktseite sagt, was ergänzt wurde.

## Regeln
- Es wird nie ohne Vorschau gespeichert: eine falsch gelesene Mail würde sonst ein Produkt fälschlich als sicher einstufen.
- Spuren, Kreuzkontamination oder „nicht garantieren“ ergeben „nicht bestätigt“; fehlt eine klare Aussage, wählt der Nutzer.
- Automatisches Weiterleiten an eine eigene Adresse ist nicht enthalten (bräuchte einen Eingangs-Maildienst).
