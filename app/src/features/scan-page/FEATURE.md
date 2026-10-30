# Feature: Scan-Seite

Die **Scan-Seite** ist die Seite, die nach dem Scan erscheint: Einstufung mit Begründung, Zutaten,
Produktangaben und „In Datenbank speichern“. (Der Bildschirm davor, auf dem man Fotos aufnimmt, heißt
„Scan-Bildschirm“ und liegt in `src/components/Scanner.tsx`.)

## Ablauf
1. Auf dem Scan-Bildschirm Fotos aufnehmen oder hochladen, unten **Prüfen** tippen.
2. `src/lib/useScanFlow.ts` wertet aus (Barcode, Texterkennung, Datenbank, Open Food Facts, ggf. Hersteller-Website)
   und liefert ein `Draft` (Typ in `src/types.ts`).
3. `App.tsx` zeigt `ScanPage` mit diesem `Draft`. Speichern führt zur Produktseite, Abbrechen zurück zum Scan-Bildschirm.

## Aufbau der Seite (von oben nach unten)
| Bereich | Inhalt | Datei |
| --- | --- | --- |
| **Einstufung** | Hinweisfeld mit Icon und Status (bewusst kein Button: farbiger Streifen links, kein gefüllter Block) | `src/components/Verdict.tsx` |
| **Warum?** | Begründung; bei „Enthält Gluten“ und „Kann Spuren enthalten“ mit den **gefundenen Wörtern** (z. B. `Weizenmehl (Weizen)`), getrennt nach Zutatenliste, Verpackungstext und Open Food Facts | `Verdict.tsx`, `classify()` |
| **Zutaten** | Kasten mit Titel (Quelle) und Aufzählung; Buttons „Zutaten korrigieren“ und „Hersteller-Website prüfen“; Haken für das Zertifizierungslogo | `IngredientsSection.tsx`, `ScanPage.tsx` |
| **Produkt** | Name, Marke, Barcode, eingeklappter Rohtext, Speichern/Abbrechen | `ScanPage.tsx` |

## Regeln
- **Zutatenliste zeigt nur Zutaten.** Kochanweisung, Lagerhinweise, Nährwerte, Fußnoten und Spurenhinweise werden
  entfernt (`parseIngredients` in `src/lib/textClean.ts`). Spurenhinweise stehen in der Begründung.
- **Design der Zutatenliste = Design des Hinweiskastens** (`.notice-box`: linker Streifen, Titel, Aufzählung).
  Glutenhaltige Zutaten sind rot und fett.
- **Schlecht lesbares Foto** (weniger als 90 % sicher gelesene Wörter, siehe `TRUSTED_QUALITY`): Statt der Liste steht
  nur ein rotes X mit „Fotos schwer lesbar, die Zutaten sind unsicher“ und drei Bulletpoints (neu fotografieren,
  Produktnamen eintragen und Hersteller-Website prüfen, selbst korrigieren). Gleiches Design bei „Keine Zutaten gefunden“.
- Eine unsichere Liste ergibt höchstens **Unbekannt** (nie „Keine glutenhaltigen Zutaten“); gefundene Gluten-Wörter und
  Spurenhinweise zählen trotzdem. Hat der Nutzer die Zutaten selbst korrigiert, gilt die Liste als verlässlich.
- Eine unsichere, nicht korrigierte Liste wird **nicht** als `ingredients_text` gespeichert; der Rohtext
  (`label_text`) bleibt und wird weiter auf Gluten durchsucht.
- Stammen die Zutaten von einem passenden, aber nicht eindeutig identischen Produkt (`exact: false`), steht im Kasten
  ein Hinweis, sie mit der Packung zu vergleichen.

## Wichtige Dateien
- `ScanPage.tsx` – Seite, Zustand (Eingaben, Korrektur, Hersteller-Suche, Speichern)
- `IngredientsSection.tsx` – Zutaten-Kasten und Problemhinweis
- `../../components/Verdict.tsx` – Einstufung und Begründung (auch auf der Produktseite)
- `../../lib/classify.ts` – Einstufung, `findGlutenMatches`, strukturierte Begründung (`explanation`, `glutenFindings`)
- `../../lib/textClean.ts` – Zutatenblock aus dem Foto, `parseIngredients`
- `../../lib/manufacturer.ts` und `../../../api/product-info.ts` – Hersteller-Website

## Tests
`src/lib/classify.test.ts` (Begründung, gefundene Wörter), `src/lib/textClean.test.ts` (nur Zutaten, Zubereitung/Lagerung
entfernt), `src/lib/ingredientSource.test.ts`. Ausführen: `npm test`.

## Beim Ändern beachten
- Texte und Aussehen der Einstufung stehen zentral in `STATUS_META` (`classify.ts`).
- Icons nur über `src/components/icons.tsx`; Regeln in `public/brand/BRAND.md` (Abschnitt „Icons“).
