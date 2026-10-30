// Wandelt den <text>-Schriftzug in den Lockup-SVGs in Pfade um (Archivo 900),
// damit das Logo ohne Webfont überall identisch aussieht. Entfernt danach <style>/@import.
//
//   node scripts/outline-wordmark.mjs public/brand/svg/lockup-*.svg
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import opentype from 'opentype.js'

const require = createRequire(import.meta.url)
const fontFile = require.resolve('@fontsource/archivo/files/archivo-latin-900-normal.woff')
const buf = readFileSync(fontFile)
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
const round = (n) => Math.round(n * 100) / 100

function outline(textEl) {
  const open = textEl.match(/^<text[^>]*>/)[0]
  let x = Number(attr(open, 'x') ?? 0)
  const y = Number(attr(open, 'y') ?? 0)
  const size = Number(attr(open, 'font-size'))
  const spacing = Number(attr(open, 'letter-spacing') ?? 0)
  const scale = size / font.unitsPerEm
  const spans = [...textEl.matchAll(/<tspan([^>]*)>([^<]*)<\/tspan>/g)].map((m) => ({
    fill: attr(m[1], 'fill'),
    text: m[2],
  }))
  const chars = spans.flatMap((s) => [...s.text].map((ch) => ({ ch, fill: s.fill })))
  const paths = new Map()
  chars.forEach(({ ch, fill }, i) => {
    const glyph = font.charToGlyph(ch)
    const d = glyph.getPath(x, y, size).toPathData(2)
    if (d) paths.set(fill, (paths.get(fill) ?? '') + d)
    const next = chars[i + 1]
    const kern = next ? font.getKerningValue(glyph, font.charToGlyph(next.ch)) : 0
    // Browser setzen letter-spacing nach jedem Zeichen, Kerning zwischen Paaren.
    x += (glyph.advanceWidth + kern) * scale + spacing
  })
  return [...paths].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('')
}

for (const file of process.argv.slice(2)) {
  let svg = readFileSync(file, 'utf8')
  if (!svg.includes('<text')) {
    console.log(`${file}: kein <text>, übersprungen`)
    continue
  }
  svg = svg.replace(/<text[\s\S]*?<\/text>/g, (t) => `<g aria-hidden="true">${outline(t)}</g>`)
  svg = svg.replace(/<style>[\s\S]*?<\/style>/g, '')
  writeFileSync(file, svg)
  console.log(`${file}: umgewandelt (${round(svg.length / 1024)} KB)`)
}
