// Logos aus public/brand (Vorgaben: public/brand/BRAND.md).
// Auf dunklem Grund (Dark Mode) die -dark-Varianten verwenden.

export function LogoHorizontal() {
  return (
    <a href="/" className="ws-logo" aria-label="Wheat Shield – Startseite">
      <picture>
        <source srcSet="/brand/svg/lockup-horizontal-dark.svg" media="(prefers-color-scheme: dark)" />
        <img src="/brand/svg/lockup-horizontal-color.svg" alt="Wheat Shield" width={198} height={36} />
      </picture>
    </a>
  )
}

export function LogoStacked() {
  return (
    <picture>
      <source srcSet="/brand/svg/lockup-stacked-dark.svg" media="(prefers-color-scheme: dark)" />
      <img className="lockup-stacked" src="/brand/svg/lockup-stacked-color.svg" alt="Wheat Shield" width={180} height={180} />
    </picture>
  )
}
