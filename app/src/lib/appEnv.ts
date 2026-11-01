/**
 * Welche Umgebung läuft? In der Testumgebung (Vercel-Vorschau, Variable VITE_APP_ENV=test) steht oben ein Hinweis,
 * damit niemand Testdaten für echt hält. Beschreibung: TESTUMGEBUNG.md im Repository.
 */
export const IS_TEST = import.meta.env.VITE_APP_ENV === 'test'
