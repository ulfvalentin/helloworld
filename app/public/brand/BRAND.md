# Wheat Shield – Brand Kit

App zum Scannen und Erkennen von Lebensmitteln mit Blick auf Zöliakie.
Diese Datei richtet sich an Claude Code: Bitte Logo, Farben und Schrift genau so übernehmen.

## Dateien

| Datei | Verwendung |
|---|---|
| `svg/mark-color.svg` | Bildmarke (Schild), Standard auf hellem Grund |
| `svg/mark-dark.svg` | Bildmarke auf dunklem Grund (Navy) |
| `svg/mark-mono.svg` / `mark-mono-white.svg` | Einfarbig, z. B. Druck, Stempel |
| `svg/lockup-horizontal-*.svg` | Schild + „WHEAT SHIELD“ einzeilig, z. B. Header/Navbar |
| `svg/lockup-stacked-*.svg` | Schild + zweizeilig „WHEAT / SHIELD“, z. B. Splash, Login |
| `svg/app-icon.svg` | App-Icon-Master 1024 × 1024 (vollflächig, Plattform rundet die Ecken) |
| `svg/app-icon-small.svg` | Vereinfachtes Icon für ≤ 48 px (Favicon) |
| `png/app-icon-{1024,512,192,180}.png` | Store, PWA-Manifest, Apple Touch Icon |
| `png/favicon-{64,48,32}.png` | Favicons |
| `png/mark-*-500.png` | Bildmarke als Rastergrafik |

## Farben

| Token | Hex | Einsatz |
|---|---|---|
| `--ws-navy` | `#1B2A3A` | Primärfarbe, Text, dunkle Flächen |
| `--ws-gold` | `#E0A93B` | Akzent, Schildhälfte, Flächen – **nicht** für Text auf Weiß (Kontrast zu gering) |
| `--ws-gold-text` | `#9A6A12` | Gold für Text auf hellem Grund (≥ 4.5:1 ab Fettschrift/Large) |
| `--ws-ground` | `#F2F0EA` | Heller Seitenhintergrund |
| `--ws-white` | `#FFFFFF` | Karten, Flächen |
| `--ws-muted` | `#5C6470` | Sekundärtext |

```css
:root {
  --ws-navy: #1B2A3A;
  --ws-gold: #E0A93B;
  --ws-gold-text: #9A6A12;
  --ws-ground: #F2F0EA;
  --ws-white: #FFFFFF;
  --ws-muted: #5C6470;
}
```

## Schrift

- **Wortmarke:** Archivo, Gewicht 900 (Black), nur Großbuchstaben, Laufweite ca. 0.02–0.04em.
- „WHEAT“ in Gold (`--ws-gold-text` auf hell, `--ws-gold` auf dunkel), „SHIELD“ in Navy (bzw. Weiß auf dunkel).
- Fließtext in der App: Archivo 400–600.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800;900&display=swap" rel="stylesheet">
```

Self-Hosting (empfohlen wegen DSGVO): `npm i @fontsource/archivo` bzw. Variable-Font-Datei aus Google Fonts lokal einbinden.

## Wichtig: Wortmarke noch in Pfade umwandeln

Die Lockup-SVGs setzen den Schriftzug als `<text>` mit Archivo (per `@import` von Google Fonts, Fallback Arial Black).
Für die finale Version die Schrift in Pfade umwandeln (Figma/Illustrator „Outline“, oder per Script mit `opentype.js` und der lokal installierten Archivo-Datei), damit das Logo überall identisch aussieht und ohne Font-Laden funktioniert.
Die Bildmarken (`mark-*`, `app-icon*`) enthalten keine Schrift und sind fertig.

## Regeln

- Schutzzone rund um das Logo: mindestens die halbe Schildbreite.
- Mindestgröße Bildmarke: 24 px Höhe; darunter `app-icon-small.svg` verwenden.
- Schild nicht verzerren, keine Schatten, keine Verläufe, keine Umfärbung außerhalb der Varianten oben.
- Das offizielle „Crossed Grain“-Gluten-frei-Symbol (AOECS/DZG) ist eine geschützte Marke und wird **nicht** verwendet; die durchgestrichene Ähre im Schild ist eine eigene Zeichnung. Vor Markenanmeldung rechtlich prüfen lassen.

## Beispiel: Logo im Header

```html
<a href="/" class="ws-logo" aria-label="Wheat Shield – Startseite">
  <img src="/brand/svg/lockup-horizontal-color.svg" alt="Wheat Shield" height="40">
</a>
```
