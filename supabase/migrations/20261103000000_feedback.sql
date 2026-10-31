-- Feedback aus der App („Feedback senden“ im Konto-Menü): Freitext von angemeldeten Nutzern.
-- Jede Person darf eigenes Feedback senden und lesen; ausgewertet wird im Supabase-Dashboard (Table Editor).
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  message    text not null check (length(btrim(message)) > 0 and length(message) <= 10000),
  page       text,        -- Bildschirm, von dem aus gesendet wurde (z. B. "scan", "product")
  user_email text,
  user_agent text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "feedback senden" on public.feedback for insert to authenticated
  with check (created_by = auth.uid());
create policy "eigenes feedback lesen" on public.feedback for select to authenticated
  using (created_by = auth.uid());
