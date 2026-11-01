# Testumgebung

Neue Funktionen laufen zuerst in der **Testumgebung** (`https://test.wheatshield.de`) und gehen erst nach dem Ausprobieren
live (`https://www.wheatshield.de`). Die Testumgebung hat eine **eigene Supabase-Datenbank**: Was dort gescannt, gespeichert
oder gelöscht wird, berührt die echten Daten nicht. Oben in der App steht „Testumgebung – Daten sind nicht echt“.

## Ablauf

| Schritt | Wo | Was passiert |
| --- | --- | --- |
| 1. Entwickeln | Pull Request → Branch `staging` | Vercel baut eine Vorschau (eigene Adresse im PR). |
| 2. Testen | `staging` → `test.wheatshield.de` | Nach dem Merge in `staging` steht der Stand unter test.wheatshield.de. |
| 3. Freigeben | Pull Request `staging` → `master` | Erst nach „passt“ von Ulf wird gemergt. |
| 4. Live | `master` → `www.wheatshield.de` | Vercel rollt die Produktion aus. |

Datenbank-Änderungen (`supabase/migrations/*.sql`) werden zuerst in der Test-Datenbank ausgeführt und erst bei der
Freigabe in der echten.

## Einmalige Einrichtung

### 1. Test-Datenbank in Supabase
1. https://supabase.com/dashboard → **New project**, Name z. B. `wheat-shield-test`, Region Frankfurt (eu-central-1).
2. **SQL Editor**: die Dateien aus `supabase/migrations/` in der Reihenfolge ihrer Namen ausführen (älteste zuerst).
3. **Authentication → URL Configuration**: Site URL `https://test.wheatshield.de`, Redirect URLs
   `https://test.wheatshield.de/**` und `https://*-ulfs-projects-a68eeecc.vercel.app/**` (Vorschauen der Pull Requests).
4. **Authentication → Users → Add user**: Test-Nutzer anlegen.
5. **Project Settings → API**: Project URL und Publishable Key notieren (öffentlich, kein Secret-Key!).

### 2. Vercel (Projekt „app“)
1. **Settings → Environment Variables**, jeweils nur für **Preview**:
   - `VITE_SUPABASE_URL` = Project URL der Test-Datenbank
   - `VITE_SUPABASE_ANON_KEY` = Publishable Key der Test-Datenbank
   - `VITE_APP_ENV` = `test`
   - optional `GITHUB_FEEDBACK` = derselbe Token wie in Production (Feedback aus dem Test ist im Issue als „Umgebung: Test“ markiert)
2. **Settings → Domains → Add**: `test.wheatshield.de`, bei „Git Branch“ `staging` auswählen.
3. Beim Domain-Anbieter den DNS-Eintrag anlegen, den Vercel anzeigt (meist CNAME `test` → `cname.vercel-dns.com`).
4. **Deployments**: das letzte `staging`-Deployment mit **Redeploy** neu bauen, damit die Variablen greifen.

Vercel-Variablen haben Vorrang vor `app/.env.production`; ohne sie würde die Vorschau die echte Datenbank benutzen.
