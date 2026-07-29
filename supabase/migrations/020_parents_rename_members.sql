-- 020_parents_rename_members.sql
-- Parents may edit any profile in their family. The 019 guard trigger still
-- blocks role/family_id changes, so this only ever allows renames.

drop policy if exists prof_update_parent on public.profiles;
create policy prof_update_parent on public.profiles
  for update using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());
