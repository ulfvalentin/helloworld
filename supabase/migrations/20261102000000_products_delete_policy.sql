-- Produkte löschen: erlaubt für die Person, die den Eintrag angelegt hat.
-- Herstellerbestätigungen des Produkts werden automatisch mitgelöscht (on delete cascade);
-- gespeicherte Scans bleiben ohne Produktbezug erhalten (on delete set null).
create policy "eigene products löschen" on public.products for delete to authenticated
  using (created_by = auth.uid());
