-- Herstellerbestätigungen: Ansprechpartner und E-Mail-Adresse getrennt speichern.
-- `contact` bleibt für weitere Angaben (Funktion, Telefon, Website) und für ältere Einträge bestehen.
alter table public.manufacturer_confirmations
  add column if not exists contact_name  text,
  add column if not exists contact_email text;

-- Ältere Einträge: E-Mail-Adresse aus dem Freitext herauslösen, den Rest als Name übernehmen.
update public.manufacturer_confirmations
set contact_email = (regexp_match(contact, '[^\s<>,;]+@[^\s<>,;]+'))[1]
where contact_email is null and contact ~ '[^\s<>,;]+@[^\s<>,;]+';

update public.manufacturer_confirmations
set contact_name = nullif(btrim(regexp_replace(regexp_replace(contact, '[^\s<>,;]+@[^\s<>,;]+', '', 'g'), '[<>·,;]+', ' ', 'g')), '')
where contact_name is null and contact_email is not null;
