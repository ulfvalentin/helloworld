# Wheat Shield

Web-App (läuft im Handy-Browser), um schnell zu erkennen, ob ein Lebensmittel Gluten enthält.
Foto aufnehmen → Text und Barcode erkennen → Abgleich mit eigener Supabase-Datenbank und
Open Food Facts → Einstufung nach unseren Regeln. Jedes eingescannte Produkt landet in der
gemeinsamen Datenbank, die so mit der Zeit wächst.

## Einstufung

| Status | Wann |
| --- | --- |
| **Sicher glutenfrei lt. Hersteller** | Zertifizierungslogo (durchgestrichene Ähre) auf der Packung **oder** Hersteller hat auf Nachfrage bestätigt und die Antwort ist höchstens 6 Monate alt |
| **Keine glutenhaltigen Zutaten** | Die Zutatenliste nennt kein Gluten (auch wenn „glutenfrei“ ohne Logo auf der Packung steht oder Spuren anderer Allergene genannt werden). Kreuzkontamination ist nicht ausgeschlossen. Nur bei verlässlich gelesener Zutatenliste, sonst „Unbekannt“ |
| **Kann Spuren von Gluten enthalten** | Spurenhinweis nennt Weizen/Gerste/… oder Hersteller hat nicht bestätigt |
| **Enthält Gluten** | glutenhaltige Zutat (Weizen, Roggen, Gerste, Hafer, Dinkel, Malz, …) |
| **Unbekannt** | Zu wenig oder unsicher gelesene Informationen |

Die Regeln stehen in `src/lib/classify.ts` (mit Tests in `classify.test.ts`), u. a.:
Buchweizen ist glutenfrei, Glukosesirup/Maltodextrin aus Weizen gelten laut LMIV nicht als
glutenhaltig, „glutenfreier Hafer“ und „ohne Weizen“ werden nicht als Gluten gewertet.
Abgelaufene Herstellerbestätigungen stuft die App automatisch zurück. Die Namen in der App wechseln hier,
in der Datenbank (enum `gluten_status`) bleiben die ursprünglichen Schlüssel bestehen.

Das Logo selbst kann die Texterkennung nicht lesen – deshalb bestätigt man es per Häkchen.
Eine gefundene Lizenznummer (z. B. `DE-020-012`) löst einen Hinweis aus.

## Einrichtung

```bash
cd app
npm install
cp .env.example .env.local   # Supabase-URL und anon key eintragen
npm run dev
```

Ohne `.env.local` läuft die App im Demo-Modus und speichert nur im Browser.

Supabase:
1. Projekt anlegen, Migration `../supabase/migrations/*.sql` im SQL-Editor ausführen
   (oder `supabase db push`).
2. Authentication → E-Mail (Magic Link) aktivieren, Site-URL auf die App-Adresse setzen.
3. Alle angemeldeten Nutzer teilen sich die Produktdatenbank (Row Level Security).

Nützliche Views:
- `products_current` – tagesaktueller Status inkl. Ablauf der Herstellerbestätigung
- `confirmations_due` – Produkte, bei denen der Hersteller in den nächsten 30 Tagen erneut
  angefragt werden sollte

## Befehle

- `npm run dev` – Entwicklungsserver
- `npm test` – Tests der Einstufungsregeln
- `npm run build` – Typecheck und Produktions-Build

## So läuft eine Prüfung

Jede Prüfung durchläuft vier Quellen und gleicht sie ab (Details: [`src/features/scan-page/FEATURE.md`](src/features/scan-page/FEATURE.md)):

1. **Fotos prüfen** – Barcode und Text lesen; die Texterkennung liefert pro Wort eine Sicherheit, der Zutatenblock wird bis zur
   Nährwerttabelle herausgeschnitten (`src/lib/textClean.ts`)
2. **Herstellerseite** – `api/product-info.ts` (Vercel-Funktion, weil der Browser fremde Websites nicht lesen darf) probiert
   Webadressen von der Packung, die Produktseite aus Open Food Facts und die vermutete Hersteller-Domain, blättert durch
   Produktübersichten und sucht notfalls im Web. Eine Seite zählt nur, wenn sie zum Produkt passt (Barcode, Name oder
   übereinstimmende Zutatenwörter). Die Funktion ruft nur öffentliche http(s)-Adressen ab
3. **Open Food Facts** – Name, Marke, Zutaten, Allergene, Spuren, Labels
4. **Eigene Datenbank** – ist das Produkt schon gespeichert? Hat sich die Rezeptur geändert?
5. **Abgleich** – die Zutatenlisten werden verglichen, Unterschiede erscheinen als Hinweise; nennt eine Quelle Gluten-Getreide,
   das anderswo fehlt, gibt es eine Warnung und die Einstufung beachtet es

Auf der Scan-Seite stehen Produkt, Hersteller und Barcode (mit Quelle), die vollständige Zutatenliste, die Hinweise und das
Ergebnis jedes Schritts. Eine „glutenfrei“-Aussage der Hersteller-Website ergibt nur „Keine glutenhaltigen Zutaten“ – „Sicher
glutenfrei lt. Hersteller“ bleibt der Anfrage beim Hersteller oder dem Logo vorbehalten. Lokal (`npm run dev`) wird die
Funktion automatisch mit bereitgestellt.

## Features

Größere Seiten liegen als Feature unter `src/features/<name>/` und haben dort eine eigene `FEATURE.md`:
- **Scan-Seite** (Ergebnis nach dem Scan): [`src/features/scan-page/FEATURE.md`](src/features/scan-page/FEATURE.md)

## Marke

Logo, Farben und Schrift: `public/brand/BRAND.md`. Die Farben stehen als `--ws-*`-Variablen
in `src/styles.css`, Icons (flach, einfarbig, Lucide) nur über `src/components/icons.tsx` – Regeln im Abschnitt „Icons“ der `BRAND.md`. Archivo wird über `@fontsource/archivo` selbst ausgeliefert (kein Google Fonts).

Die Lockup-SVGs enthalten den Schriftzug als Pfade. Neue oder geänderte Lockups mit `<text>`
so umwandeln:

```bash
node scripts/outline-wordmark.mjs public/brand/svg/lockup-*.svg
```
