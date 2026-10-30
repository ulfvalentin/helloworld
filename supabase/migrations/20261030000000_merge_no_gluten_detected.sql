-- Die Stufe „Keine Glutenzutaten erkannt“ (no_gluten_detected) entfällt: Solche Produkte gehören jetzt
-- zu „Keine glutenhaltigen Zutaten“ (Schlüssel unverified_gluten_free).
--
-- Optional: räumt alte Zeilen auf. Die App berechnet den Status beim Laden ohnehin neu, es ist also
-- ungefährlich, wenn dieses Skript nicht läuft. Der Enum-Wert no_gluten_detected bleibt bestehen
-- (Postgres kann Enum-Werte nicht entfernen); die App schreibt ihn nicht mehr.
update public.products
set status = 'unverified_gluten_free'
where status = 'no_gluten_detected';
