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

## Zutaten lesen und Hersteller-Suche

Die Texterkennung liefert pro Wort eine Sicherheit. Die App zeigt nur sicher gelesene Wörter und
schneidet die Zutatenliste (bis zur Nährwerttabelle) heraus (`src/lib/textClean.ts`). Der komplette
erkannte Text wird trotzdem nach Gluten durchsucht und steht eingeklappt unter „Produkt“.

Ist die Zutatenliste auf dem Foto nicht verlässlich lesbar, fragt die App der Reihe nach:
eigene Datenbank → Open Food Facts → **Hersteller-Website** (`api/product-info.ts`, eine Vercel-Funktion,
weil der Browser fremde Websites nicht lesen darf). Die Funktion probiert Webadressen von der Packung,
die Produktseite aus Open Food Facts und die vermutete Hersteller-Domain, folgt passenden Links und
sucht notfalls im Web. Eine Seite zählt nur, wenn sie zum Produkt passt (Barcode, Produktname oder
übereinstimmende Zutatenwörter vom Foto). Eine „glutenfrei“-Aussage dort ergibt nur
„Keine glutenhaltigen Zutaten“ – „Sicher glutenfrei lt. Hersteller“ bleibt der Anfrage beim Hersteller oder dem Logo vorbehalten.

Die Funktion ruft nur öffentliche http(s)-Adressen ab (keine internen Netze, begrenzte Größe und Zeit).
Lokal (`npm run dev`) wird sie automatisch mit bereitgestellt.

## Marke

Logo, Farben und Schrift: `public/brand/BRAND.md`. Die Farben stehen als `--ws-*`-Variablen
in `src/styles.css`, Archivo wird über `@fontsource/archivo` selbst ausgeliefert (kein Google Fonts).

Die Lockup-SVGs enthalten den Schriftzug als Pfade. Neue oder geänderte Lockups mit `<text>`
so umwandeln:

```bash
node scripts/outline-wordmark.mjs public/brand/svg/lockup-*.svg
```
