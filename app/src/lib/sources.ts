import type { SourceId } from '../types'

/** Anzeigenamen der vier Quellen jeder Prüfung. */
export const SOURCE_NAME: Record<SourceId, string> = {
  foto: 'Foto',
  hersteller: 'Hersteller-Website',
  openfoodfacts: 'Open Food Facts',
  datenbank: 'eure Datenbank',
}
