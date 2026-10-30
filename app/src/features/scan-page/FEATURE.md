# Feature: Scan-Seite

Die **Scan-Seite** ist die Seite, die nach dem Scan erscheint: Einstufung mit Begründung, Produkt, Zutaten, Hinweise,
Prüfschritte und „In Datenbank speichern“. (Der Bildschirm davor, auf dem man Fotos aufnimmt, heißt „Scan-Bildschirm“
und liegt in `src/components/Scanner.tsx`.)

## Ablauf einer Prüfung
Unten auf **Prüfen** tippen startet `runCheck` (`src/lib/runCheck.ts`). **Jede Prüfung durchläuft alle Schritte**, auch wenn
das Foto gut lesbar ist – der Abgleich lebt davon, mehrere Quellen zu vergleichen:

| # | Schritt | Was passiert |
| --- | --- | --- |
| 1 | **Fotos prüfen** | Barcode lesen, Text erkennen, Zutatenblock, Firma, Webadressen und markante Zutatenwörter herausholen |
| 2 | **Herstellerseite durchsuchen** | Hersteller-Website aufrufen und nach den Produktinformationen suchen (`/api/product-info`) |
| 3 | **Open Food Facts abrufen** | Produkt per Barcode: Name, Marke, Zutaten, Allergene, Spuren, Labels |
| 4 | **Mit eurer Datenbank abgleichen** | Bereits gespeichertes Produkt per Barcode finden |
| 5 | **Quellen abgleichen** | Zutatenlisten vergleichen, Liste wählen, Hinweise und Produktangaben zusammenstellen |

Die Schritte 3 und 4 laufen vor Schritt 2, weil Name und Marke daraus die Suche auf der Herstellerseite genauer machen; angezeigt
werden sie in der Reihenfolge 1–5. Der Fortschritt steht live auf dem Scan-Bildschirm (`CheckProgress`), das Ergebnis jeder Quelle
danach unter „So wurde geprüft“ (`CheckSteps`). Ein Fehler einer Quelle stoppt die Prüfung nicht und wird dort benannt.

`runCheck` sammelt die Rohdaten (`CheckContext`) und ruft `assembleDraft` auf. „Hersteller-Website prüfen“ auf der Seite ruft
`assembleDraft` mit der neuen Antwort erneut auf, ohne die Fotos nochmal zu lesen.

## Abgleich (`src/lib/reconcile.ts`)
- **Angezeigte Liste:** gut lesbares Foto → Hersteller-Website (nachweislich dasselbe Produkt) → Open Food Facts →
  eigene Datenbank → Hersteller-Website (nicht eindeutig) → unsicheres Foto.
- **Vergleich** (`ingredientsCompare.ts`): Zutaten ohne Klammern, Prozente, Endungen; kleine Tippfehler der Texterkennung
  zählen als gleich. Abweichungen erscheinen als Hinweis („Open Food Facts nennt zusätzlich …“).
- **Gluten:** Nennt eine Quelle Gluten-Getreide, das in der angezeigten Liste fehlt, gibt es eine Warnung, und die Einstufung
  beachtet sie. Dafür steht die Liste jeder weiteren externen Quelle als Zeile `Quelle <Name>: <Zutaten>` im gespeicherten
  Rohtext (`label_text`, siehe `labelText.ts`); `classify()` liest diese Zeilen (`where: 'quelle'`).
- Die eigene Datenbank wird verglichen (Rezeptur geändert?), zählt aber nicht für die Gluten-Suche (alter Stand).

## Aufbau der Seite (von oben nach unten)
| Bereich | Inhalt | Datei |
| --- | --- | --- |
| **Einstufung** | Hinweisfeld mit Icon und Status (kein Button: Streifen links), darunter „Warum?“ mit den gefundenen Wörtern | `components/Verdict.tsx` |
| **Produkt** | Produkt, Hersteller (Marke und Firma) und Barcode, jeweils mit der Quelle; „nicht erkannt“, wenn keine Quelle es kennt | `ProductSummary.tsx` |
| **Zutaten** | Vollständige Aufzählung im Hinweiskasten-Design, mit Quelle und Abgleich-Ergebnis; Buttons „Zutaten korrigieren“ und „Hersteller-Website prüfen“; Haken für das Zertifizierungslogo | `IngredientsSection.tsx`, `ScanPage.tsx` |
| **Hinweise** | Warnungen und Infos: Unterschiede zwischen Quellen, Spuren, Allergene, Labels, Aussagen der Hersteller-Website | `Notes.tsx` |
| **So wurde geprüft** | Die vier Quellen und der Abgleich mit ihrem Ergebnis (nicht beim Bearbeiten eines gespeicherten Produkts) | `CheckSteps.tsx` |
| **Produkt bearbeiten** | Name, Hersteller/Marke, Barcode, eingeklappter Rohtext, Speichern/Abbrechen | `ScanPage.tsx` |

## Regeln
- **Zutatenliste zeigt nur Zutaten**, vollständig: Kochanweisung, Lagerhinweise, Nährwerte, Fußnoten und Spurenhinweise werden
  entfernt (`parseIngredients` in `textClean.ts`); Spuren stehen unter „Hinweise“. Die Foto-Liste behält auch mittelsichere Wörter.
- **Unsicheres Foto** (weniger als 90 % sicher gelesene Wörter, `TRUSTED_QUALITY`) ohne bessere Quelle: rotes X mit „Fotos schwer
  lesbar, die Zutaten sind unsicher“ und drei Bulletpoints, darunter die gelesene Liste als „unsicher“. Gleiches Design bei „Keine
  Zutaten gefunden“. Liefert eine andere Quelle die Zutaten, steht die Liste von dort.
- **Gluten-Schluss nur aus der Zutatenliste:** Verpackungstext, Werbeaussagen („glutenfrei“), Zubereitung und Open-Food-Facts-Tags
  entscheiden nichts (sie erscheinen unter „Hinweise“). Spuren zählen nur, wenn sie in der Zutatenliste stehen. Nennt die Liste einer
  anderen Quelle Gluten, die gewählte aber nicht, lautet die Einstufung **Unbekannt** mit Hinweis auf den Widerspruch.
- **Weitere Fotos:** Fehlt die Zutatenliste oder ist sie unsicher gelesen, erscheint „Weitere Fotos hinzufügen“. Die Prüfung läuft mit
  allen bisherigen und den neuen Fotos erneut (bereits gelesene Fotos werden nicht neu gelesen); eingegebene Angaben bleiben.
- **Häkchen:** Jeder beendete Prüfschritt zeigt ein ✓ (das Ergebnis steht im Text); nur ein Fehler zeigt ein ✗.
- Eine unsichere Liste ergibt höchstens **Unbekannt**; gefundene Gluten-Wörter und Spurenhinweise zählen trotzdem. Hat der Nutzer die
  Zutaten korrigiert, gilt sie als verlässlich. Eine unsichere, nicht korrigierte Liste wird nicht als `ingredients_text` gespeichert.
- **Produktangaben** stammen aus der eigenen Datenbank, Open Food Facts, der Hersteller-Website (Name nur bei nachweislich gleichem
  Produkt) und der Verpackung (Firma). Sind alle leer, steht „nicht erkannt“ – nichts wird erfunden.

## Wichtige Dateien
`ScanPage.tsx`, `IngredientsSection.tsx`, `ProductSummary.tsx`, `Notes.tsx`, `CheckSteps.tsx` (hier);
`components/Verdict.tsx`, `components/CheckProgress.tsx`;
`lib/runCheck.ts` (Ablauf, `assembleDraft`), `lib/reconcile.ts`, `lib/ingredientsCompare.ts`, `lib/labelText.ts`, `lib/classify.ts`,
`lib/textClean.ts`, `lib/openFoodFacts.ts`, `lib/manufacturer.ts`, `api/product-info.ts`.

## Tests
`runCheck.test.ts` (Ablauf mit nachgestellten Quellen), `ingredientsCompare.test.ts`, `classify.test.ts`, `textClean.test.ts`.
Ausführen: `npm test`.

## Beim Ändern beachten
- Neue Quelle: in `runCheck.ts` sammeln, in `assembleDraft` einordnen, in `STEP_LABELS`/`SOURCE_NAME` benennen.
- Texte und Aussehen der Einstufung stehen zentral in `STATUS_META` (`classify.ts`).
- Icons nur über `src/components/icons.tsx`; Regeln in `public/brand/BRAND.md` (Abschnitt „Icons“).
