-- 008_wellbeing_private.sql
-- Wellbeing + respite checklists are mum & dad's private self-care space.
-- With daily/weekly already parents-only (007), ALL checklist reads are now
-- parents-only. Family still sees the shift pattern (shift_blocks unchanged).

drop policy itm_select on public.checklist_items;
create policy itm_select on public.checklist_items
  for select using (family_id = public.my_family_id() and public.is_parent());
