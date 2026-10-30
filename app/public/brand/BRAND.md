# Wheat Shield – Brand & Design-System

Verbindliche Vorgabe für alle Seiten und Komponenten der App.
**Für Claude Code:** Diese Datei vor jeder UI-Arbeit lesen. Neue Seiten bauen ausschließlich aus den Tokens und Komponenten unten. Weicht etwas ab, lieber nachfragen als improvisieren.

---

## 1. Produktprinzipien

1. **Mobile first, Kamera first.** Die App wird stehend im Supermarkt mit einer Hand benutzt. Jede Seite wird zuerst für 390 px Breite gestaltet.
2. **Barcode zuerst, Fotos als Ersatzweg.** Der schnellste Weg zum Ergebnis ist immer der Standard.
3. **Ein Schritt pro Bildschirm.** Keine Anleitungslisten vor der Aktion. Hinweise stehen dort, wo sie gebraucht werden.
4. **Das Urteil ist in einer Sekunde lesbar.** Farbe, Symbol und Text sagen immer dasselbe.
5. **Vertrauen durch Belege.** Jedes Ergebnis zeigt, *warum* (Zutat, Hinweis auf der Verpackung) und *woher* (Datenbank, Foto, Stand).
6. **Ruhig statt laut.** Wenige Farben, viel Abstand, keine Dekoration.

---

## 2. Logo

| Datei | Verwendung |
|---|---|
| `svg/lockup-horizontal-dark.svg` | App-Header (dunkles Theme) |
| `svg/lockup-horizontal-color.svg` | App-Header (helles Theme), Website |
| `svg/lockup-stacked-*.svg` | Splash, Login, Onboarding |
| `svg/mark-*.svg` | Bildmarke allein, ab 24 px Höhe |
| `svg/app-icon.svg`, `png/app-icon-*.png` | Store, PWA-Manifest (`theme_color: #1B2A3A`) |
| `svg/app-icon-small.svg`, `png/favicon-*.png` | ≤ 48 px, Favicon |

- Im App-Header: Bildmarke 24 px hoch + Schriftzug 17 px, links ausgerichtet.
- Schutzzone: mindestens die halbe Schildbreite rundherum.
- Nicht verzerren, umfärben, mit Schatten oder Verlauf versehen.
- Das offizielle „Crossed Grain“-Glutenfrei-Symbol (AOECS/DZG) ist eine geschützte Marke und wird **nirgends** verwendet.

---

## 3. Design-Tokens

Alle Werte nur über diese Variablen. Keine Hex-Werte direkt in Komponenten.

### 3.1 Farben – Marke

```css
--ws-navy:      #1B2A3A;  /* Markenfarbe, Flächen */
--ws-gold:      #E0A93B;  /* Primäraktion, Akzent, aktiver Zustand */
--ws-gold-text: #9A6A12;  /* Gold als Text auf hellem Grund */
```

### 3.2 Farben – Theme

Dunkel ist das aktuelle Theme. Hell ist für die Nutzung im Laden empfohlen, standardmäßig gilt die Systemeinstellung (`prefers-color-scheme`).

| Token | Dunkel | Hell | Verwendung |
|---|---|---|---|
| `--ws-bg` | `#111A24` | `#F7F5EF` | Seitenhintergrund |
| `--ws-surface` | `#1B2A3A` | `#FFFFFF` | Karten, Listenzeilen, Sekundär-Buttons |
| `--ws-surface-2` | `#2C3B4C` | `#ECE9E1` | Platzhalter, inaktive Fortschrittssegmente |
| `--ws-camera` | `#0A1018` | `#0A1018` | Kamerabereich (immer dunkel) |
| `--ws-border` | `#22303F` | `#DDD8CC` | Trennlinien, Rahmen |
| `--ws-text` | `#F3F1EC` | `#1B2A3A` | Primärtext |
| `--ws-text-2` | `#C9D1DC` | `#3E4753` | Fließtext, Hinweise |
| `--ws-muted` | `#A9B4C2` | `#5C6470` | Labels, Metadaten |
| `--ws-primary` | `#E0A93B` | `#E0A93B` | Primär-Button-Fläche |
| `--ws-on-primary` | `#111A24` | `#111A24` | Text auf Primär-Button |
| `--ws-accent-text` | `#E0A93B` | `#9A6A12` | Links, aktiver Tab, Gold-Text |

### 3.3 Farben – Status (Kern der App)

Immer genau drei Stufen. Jede Stufe hat Banner, Symbolkreis, Chip und Markierung.

| Stufe | Token-Präfix | Banner-BG (dunkel) | Symbolkreis | Chip-BG / Text (dunkel) | Hell: BG / Text |
|---|---|---|---|---|---|
| Glutenfrei | `--ws-safe` | `#173B2C` | `#4CC38A` | `#173B2C` / `#7FE0AE` | `#E3F4EA` / `#1B6B45` |
| Spuren möglich | `--ws-warn` | `#4D3410` | `#FFB547` | `#4D3410` / `#FFE0B0` | `#FFF1DB` / `#8A5A00` |
| Enthält Gluten | `--ws-danger` | `#5A1F1A` | `#FF8A7A` | `#4A1F1C` / `#FFA59A` | `#FCE7E4` / `#A3281C` |

Regeln:
- Status nie nur über Farbe: immer Symbol (✓ / ! / ✕) **und** Text.
- Statusfarben nur für Status, nie für Deko oder Buttons.
- Gold ist Marke und Aktion, nie Warnung.
- Alle Textpaare oben erreichen mindestens 4.5:1 (geprüft).

### 3.4 Typografie

Schrift: **Archivo** (self-hosted über `@fontsource/archivo`, kein Google-CDN wegen DSGVO).

| Token | Größe / Zeilenhöhe | Gewicht | Verwendung |
|---|---|---|---|
| `--ws-type-verdict` | 28 / 1.15 | 900 | Ergebnis-Urteil („Enthält Gluten“) |
| `--ws-type-h1` | 26 / 1.2 | 800 | Seitentitel |
| `--ws-type-h2` | 24 / 1.2 | 800 | Schritt-Titel |
| `--ws-type-title` | 17 / 1.3 | 700 | Produktname, Kartentitel |
| `--ws-type-body` | 15 / 1.55 | 400–600 | Fließtext, Buttons |
| `--ws-type-small` | 14 / 1.45 | 400 | Metadaten |
| `--ws-type-label` | 13 / 1.3, Laufweite 0.08em, VERSALIEN | 700 | Abschnitts-Labels („ZULETZT GEPRÜFT“) |
| `--ws-type-tab` | 12 / 1.2 | 600–700 | Tab-Leiste |

- Mindestgröße für Text: 12 px. Eingabefelder: 16 px (verhindert Auto-Zoom auf iOS).
- Die Wortmarke (Versalien, 900) gibt es nur im Logo, nicht für Überschriften.

### 3.5 Abstände, Radien, Größen

```css
--ws-space-1: 4px;   --ws-space-2: 8px;   --ws-space-3: 12px;
--ws-space-4: 16px;  --ws-space-5: 20px;  --ws-space-6: 24px;
--ws-space-8: 32px;

--ws-radius-sm: 12px;   /* Thumbnails, Markierungen */
--ws-radius-md: 16px;   /* Buttons, Karten, Listenzeilen */
--ws-radius-lg: 24px;   /* Kamera-/Sucherflächen */
--ws-radius-pill: 999px;/* Chips, Icon-Buttons */

--ws-touch: 44px;       /* minimale Touch-Fläche */
--ws-btn-h: 56px;       /* Primär-/Sekundär-Button */
--ws-row-h: 52px;       /* Listenzeile */
--ws-tabbar-h: 76px;
```

- Seitenrand: 20 px. Abstand zwischen Blöcken: 16–18 px.
- Inhaltsbreite auf größeren Screens: max. 480 px, zentriert (die App bleibt eine Mobile-App, auch am Desktop).

---

## 4. Komponenten

### Header
Logo links, runder Icon-Button (44 px, `--ws-surface`) rechts für Profil. Keine weiteren Elemente.

### Buttons
| Typ | Aussehen | Einsatz |
|---|---|---|
| Primär | 56 px hoch, volle Breite, `--ws-primary`, Text `--ws-on-primary` 16/800 | **Höchstens einer pro Screen** |
| Sekundär | 56 px, `--ws-surface`, Text `--ws-text` 15/600, optional Icon links | Ausweichwege („Eintippen“, „Ohne Barcode“) |
| Text | 48 px, transparent, `--ws-text-2` 15/600 | Tertiäre Aktionen („Melden“, „Überspringen“) |
| Icon | 44 × 44, rund, immer mit `aria-label` | Zurück, Schließen, Profil |

Primäraktionen sitzen unten im Daumenbereich.

### Sucher / Kamera
- Fläche `--ws-camera`, Radius 24 px.
- Rahmen aus vier goldenen Ecken (Strichstärke 4, abgerundete Enden), beim Barcode zusätzlich eine goldene Scan-Linie.
- Ein einziger kurzer Hinweis darunter („Barcode in den Rahmen halten“).
- Live-Feedback als Chip im Sucher („✓ Text gut lesbar“ / „! Spiegelung – Winkel ändern“).

### Fortschritt (geführte Fotos)
„Schritt X von Y“ (13 px, `--ws-muted`) über segmentierter Leiste (4 px hoch, Lücke 6 px, aktiv `--ws-gold`, offen `--ws-surface-2`). Darunter Titel (H2) und **ein** Satz Anleitung.

### Foto-Vorschaubilder
64 × 64, Radius 12. Erledigt: grüner ✓-Badge. Aktuell: 2 px goldener Rahmen. Optional: gestrichelter Rahmen mit Label.

### Auslöser
76 px rund, Gold, doppelter Ring. Mittig unten, links „Galerie“, rechts „Weiter“/„Überspringen“ als Text-Buttons.

### Ergebnis-Banner
Volle Breite oben, Hintergrund = Banner-BG der Stufe. Darin: Schließen-Button, Symbolkreis 56 px, Urteil (`--ws-type-verdict`, weiß) und Unterzeile in einem Satz („Nicht geeignet bei Zöliakie“).

### Beleg-Karte
`--ws-surface`, Radius 16, Padding 16. Label in Versalien („GEFUNDEN IN DEN ZUTATEN“), darunter der Originaltext mit `<mark>` in der Statusfarbe auf den auslösenden Begriffen. Darunter die Quellenzeile: Icon + „Quelle: … · Stand …“.

### Status-Chip
28 px hoch, Pill, Symbol + Wort („✓ Glutenfrei“, „! Spuren“, „✕ Gluten“).

### Listenzeile
52 px, `--ws-surface`, Radius 14–16, links Name (15 px), rechts Chip oder Zähler mit „›“.

### Tab-Leiste
3 Tabs (Prüfen · Verlauf · Datenbank), 76 px, Trennlinie oben. Aktiv: `--ws-accent-text` 700, inaktiv `--ws-muted`. Icon 24 px über dem Label.

### Icons
Linien-Icons, 24 × 24, Strichstärke 1.8–2, runde Enden, `currentColor`. **Keine Emojis** in der UI.

---

## 5. Seitenmuster

| Seite | Aufbau (oben → unten) |
|---|---|
| **Start / Prüfen** | Header · H1 „Was möchtest du prüfen?“ · Barcode-Sucher (Kamera startet sofort) · 2 Sekundär-Buttons nebeneinander · „ZULETZT GEPRÜFT“ (max. 3 Zeilen) · Tab-Leiste |
| **Fotos (ohne Barcode)** | Zurück + Fortschritt · H2 + ein Satz · Sucher mit Live-Chip · Vorschaubilder · Auslöser-Leiste. Reihenfolge: Vorderseite → Zutatenliste → Barcode (optional) |
| **Ergebnis** | Status-Banner · Produktzeile (Bild 64 px, Name, Marke · EAN) · Beleg-Karte · Quellenzeile · bei „Spuren“/„Gluten“: Alternativen-Zeile · unten Primär „Nächstes Produkt prüfen“ + Text-Button „Falsch erkannt? Melden“ |
| **Verlauf** | H1 · Filter-Chips nach Status · Listenzeilen nach Datum gruppiert |
| **Datenbank / Suche** | H1 · Suchfeld (16 px, Label sichtbar) · Ergebnisliste mit Status-Chips |

Neue Seiten kombinieren diese Muster. Keine neuen Layouttypen ohne Rückfrage.

---

## 6. UX-Konventionen

- **Kein Text vor der Aktion.** Anleitungen kommen nur kontextbezogen, ein Satz pro Schritt.
- **Leere, Lade- und Fehlerzustände sind Pflicht** für jede Seite:
  - Laden: Skeleton in `--ws-surface-2`, kein Spinner ohne Text, ab 2 s mit Statustext („Zutaten werden gelesen …“).
  - Nicht gefunden: klar sagen und den nächsten Schritt anbieten („Produkt noch nicht in der Datenbank – jetzt mit Fotos prüfen“).
  - Unsicher erkannt: **nie** „Glutenfrei“ raten. Im Zweifel „Spuren möglich“ mit Hinweis „Bitte Verpackung selbst prüfen“.
- **Kamera-Berechtigung:** erst erklären, dann fragen. Bei Ablehnung: Eintippen und Galerie bleiben nutzbar.
- **Rückmeldung:** kurze Haptik und Ton beim erkannten Barcode, Ergebnis direkt danach, ohne Zwischenbildschirm.
- **Melden-Funktion** auf jedem Ergebnis. Das verbessert die Datenbank.
- **Navigation:** maximal 3 Tabs, Zurück immer oben links, Schließen (✕) auf Ergebnis-Screens.

---

## 7. Sprache & Ton

- Du-Form, kurz und konkret. Verben statt Substantive („Barcode scannen“ statt „Barcode-Erfassung“).
- Deutsche Begriffe, keine Anglizismen, wo es ein gängiges deutsches Wort gibt.
- Urteile eindeutig, ohne Weichmacher: „Enthält Gluten“, nicht „Könnte eventuell Gluten enthalten“.
- Keine Gesundheitsversprechen. Fußnote im Profil/Impressum: Die App ersetzt keine ärztliche Beratung, maßgeblich ist die Verpackung.

---

## 8. Barrierefreiheit (Pflicht)

- Kontrast: Text ≥ 4.5:1, großer Text und Icons ≥ 3:1.
- Touch-Flächen ≥ 44 × 44 px.
- Echte Elemente: `<button>`, `<a href>`, `<input>` mit `<label>`. Keine klickbaren `<div>`s.
- Icon-Buttons mit `aria-label`, dekorative SVGs mit `aria-hidden="true"`.
- Das Ergebnis-Urteil wird per `aria-live="polite"` angesagt.
- Status nie allein über Farbe (siehe 3.3).
- Dynamische Schriftgröße bis 200 % ohne abgeschnittene Texte.
- `prefers-reduced-motion` respektieren (Scan-Linie dann statisch).

---

## 9. Verboten

- Emojis in Buttons oder Labels
- Mehr als ein Primär-Button pro Screen
- Gold als Textfarbe auf Weiß (stattdessen `--ws-gold-text`)
- Statusfarben für Deko
- Verläufe, Schlagschatten auf Karten, Glas-Effekte
- Formulare im Desktop-Stil auf dem Handy
- Das offizielle Glutenfrei-Symbol

---

## 10. CSS-Startpunkt

```css
:root {
  --ws-navy:#1B2A3A; --ws-gold:#E0A93B; --ws-gold-text:#9A6A12;
  --ws-camera:#0A1018; --ws-primary:#E0A93B; --ws-on-primary:#111A24;

  /* Hell (Standard) */
  --ws-bg:#F7F5EF; --ws-surface:#FFFFFF; --ws-surface-2:#ECE9E1; --ws-border:#DDD8CC;
  --ws-text:#1B2A3A; --ws-text-2:#3E4753; --ws-muted:#5C6470; --ws-accent-text:#9A6A12;
  --ws-safe-bg:#E3F4EA; --ws-safe-fg:#1B6B45; --ws-safe-icon:#4CC38A;
  --ws-warn-bg:#FFF1DB; --ws-warn-fg:#8A5A00; --ws-warn-icon:#FFB547;
  --ws-danger-bg:#FCE7E4; --ws-danger-fg:#A3281C; --ws-danger-icon:#FF8A7A;

  --ws-radius-sm:12px; --ws-radius-md:16px; --ws-radius-lg:24px; --ws-radius-pill:999px;
  --ws-touch:44px; --ws-btn-h:56px; --ws-row-h:52px; --ws-tabbar-h:76px;
  font-family:"Archivo",system-ui,sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --ws-bg:#111A24; --ws-surface:#1B2A3A; --ws-surface-2:#2C3B4C; --ws-border:#22303F;
    --ws-text:#F3F1EC; --ws-text-2:#C9D1DC; --ws-muted:#A9B4C2; --ws-accent-text:#E0A93B;
    --ws-safe-bg:#173B2C; --ws-safe-fg:#7FE0AE;
    --ws-warn-bg:#4D3410; --ws-warn-fg:#FFE0B0;
    --ws-danger-bg:#4A1F1C; --ws-danger-fg:#FFA59A;
  }
}
```

Bei Tailwind diese Variablen in `tailwind.config` unter `theme.extend.colors` mappen (z. B. `bg: 'var(--ws-bg)'`) und nur über diese Namen verwenden.

---

## 11. Checkliste für jede neue Seite

- [ ] Für 390 px gebaut, bei 320 px nichts abgeschnitten
- [ ] Höchstens ein Primär-Button, im Daumenbereich
- [ ] Nur Tokens, keine freien Hex-Werte
- [ ] Lade-, Leer- und Fehlerzustand vorhanden
- [ ] Hell- und Dunkelmodus geprüft
- [ ] Kontrast und Touch-Größen eingehalten, keine Emojis
- [ ] Texte in Du-Form, kurz, ohne Anglizismen
