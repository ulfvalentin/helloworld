-- GlutenCheck: wachsende Produktdatenbank mit eigener Gluten-Einstufung.
--
-- Einstufung (siehe app/src/lib/classify.ts):
--   verified_gluten_free   geprüft: Zertifizierungslogo ODER Herstellerbestätigung ≤ 6 Monate
--   unverified_gluten_free ungeprüft: "glutenfrei" ohne Logo ODER nur Spuren anderer Allergene
--   may_contain_gluten     Spuren von Gluten möglich / Hersteller verneint
--   contains_gluten        glutenhaltige Zutat
--   no_gluten_detected     keine Glutenzutat erkannt, aber keine Angabe
--   unknown                zu wenig Informationen

create type public.gluten_status as enum (
  'verified_gluten_free',
  'unverified_gluten_free',
  'may_contain_gluten',
  'contains_gluten',
  'no_gluten_detected',
  'unknown'
);

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  barcode            text unique,
  name               text,
  brand              text,
  ingredients_text   text,
  label_text         text,
  certified_label    boolean not null default false,
  certification_note text,
  external_tags      text[] not null default '{}',
  image_url          text,
  -- Zuletzt von der App berechnete Einstufung. Herstellerbestätigungen laufen ab,
  -- deshalb liefert die View products_current den tagesaktuellen Status.
  status             public.gluten_status not null default 'unknown',
  status_reasons     text[] not null default '{}',
  created_by         uuid references auth.users (id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index products_name_idx on public.products using gin (to_tsvector('german', coalesce(name, '') || ' ' || coalesce(brand, '')));

create table public.manufacturer_confirmations (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products (id) on delete cascade,
  confirmed_at         date not null,
  confirms_gluten_free boolean not null,
  contact              text,   -- z. B. "verbraucherservice@hersteller.de"
  note                 text,
  created_by           uuid references auth.users (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  constraint confirmed_not_in_future check (confirmed_at <= current_date)
);

create index manufacturer_confirmations_product_idx
  on public.manufacturer_confirmations (product_id, confirmed_at desc);

create table public.scans (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete set null,
  ocr_text   text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- Tagesaktueller Status: eine abgelaufene Bestätigung macht ein Produkt wieder "ungeprüft".
create view public.products_current with (security_invoker = true) as
select
  p.*,
  c.confirmed_at                          as last_confirmation_at,
  c.confirms_gluten_free                  as last_confirmation_positive,
  (c.confirmed_at + interval '6 months')::date as confirmation_valid_until,
  case
    when c.confirms_gluten_free is false then
      case when p.status = 'contains_gluten' then 'contains_gluten' else 'may_contain_gluten' end::public.gluten_status
    when p.certified_label then 'verified_gluten_free'::public.gluten_status
    when c.confirms_gluten_free and c.confirmed_at + interval '6 months' >= current_date
      then 'verified_gluten_free'::public.gluten_status
    when p.status = 'verified_gluten_free' then 'unverified_gluten_free'::public.gluten_status
    else p.status
  end as current_status
from public.products p
left join lateral (
  select confirmed_at, confirms_gluten_free
  from public.manufacturer_confirmations mc
  where mc.product_id = p.id
  order by confirmed_at desc, created_at desc
  limit 1
) c on true;

-- Produkte, deren Herstellerbestätigung in den nächsten 30 Tagen abläuft → erneut anfragen.
create view public.confirmations_due with (security_invoker = true) as
select id, name, brand, barcode, last_confirmation_at, confirmation_valid_until
from public.products_current
where last_confirmation_positive
  and confirmation_valid_until < current_date + 30
order by confirmation_valid_until;

-- Row Level Security: alle angemeldeten Nutzer teilen sich eine gemeinsame Datenbank.
alter table public.products enable row level security;
alter table public.manufacturer_confirmations enable row level security;
alter table public.scans enable row level security;

create policy "products lesen" on public.products for select to authenticated using (true);
create policy "products anlegen" on public.products for insert to authenticated with check (true);
create policy "products ändern" on public.products for update to authenticated using (true) with check (true);

create policy "bestätigungen lesen" on public.manufacturer_confirmations for select to authenticated using (true);
create policy "bestätigungen anlegen" on public.manufacturer_confirmations for insert to authenticated
  with check (created_by = auth.uid());
create policy "eigene bestätigungen löschen" on public.manufacturer_confirmations for delete to authenticated
  using (created_by = auth.uid());

create policy "scans lesen" on public.scans for select to authenticated using (created_by = auth.uid());
create policy "scans anlegen" on public.scans for insert to authenticated with check (created_by = auth.uid());
