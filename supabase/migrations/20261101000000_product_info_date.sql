-- Datum, an dem die Produktangaben (Zutaten, Foto, Name …) zuletzt per Scan oder E-Mail-Import eingetragen wurden.
-- Bestätigungen eines Herstellers ändern es nicht. Die App weist darauf hin, wenn es älter als 6 Monate ist.
alter table public.products
  add column if not exists info_updated_at timestamptz;

update public.products set info_updated_at = updated_at where info_updated_at is null;
