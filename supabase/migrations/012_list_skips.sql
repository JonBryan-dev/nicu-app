-- 012_list_skips.sql
-- "Skip today" for routine checklist items: the row stays (so the day's
-- regeneration can't resurrect it) but is hidden. Permanent removal deletes
-- the template instead (cascading its instances).

alter table public.checklist_items
  add column if not exists skipped boolean not null default false;
