// Decorative full-viewport background layer. Two animated gradient
// pseudo-elements (defined in App.css under .ambient) drift across the
// viewport on long ease-in-out loops. Mounted once at the app root so
// it sits behind every panel and tab. aria-hidden because it carries
// no semantic content.
export function AmbientBackground() {
  return <div className="ambient" aria-hidden="true" />
}
