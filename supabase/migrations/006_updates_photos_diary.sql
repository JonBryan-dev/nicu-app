-- 006_updates_photos_diary.sql
-- Diary upgrade for the Updates page: photos, milestone "firsts" labels,
-- and a weight/feeds growth log. Extends the schema only (no restructure).

-- ---------- updates: photos + milestone label ----------
alter table public.updates
  add column if not exists image_paths text[] not null default '{}';
alter table public.updates
  add column if not exists milestone_label text;   -- e.g. 'First cuddle' (null = normal post)

-- ---------- weight & feeds daily log ----------
create table if not exists public.care_logs (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  logged_by    uuid references public.profiles(id) on delete set null,
  log_date     date not null,
  weight_grams int check (weight_grams is null or weight_grams between 200 and 20000),
  feeds_note   text,
  created_at   timestamptz not null default now(),
  unique (family_id, log_date)
);
create index if not exists care_logs_family_date on public.care_logs (family_id, log_date);

alter table public.care_logs enable row level security;
create policy care_select on public.care_logs
  for select using (family_id = public.my_family_id());
create policy care_write on public.care_logs
  for all using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());

alter publication supabase_realtime add table public.care_logs;

-- ---------- storage bucket for update photos (private) ----------
insert into storage.buckets (id, name, public)
  values ('update-photos', 'update-photos', false)
  on conflict (id) do nothing;

-- Family-scoped by the first path segment: '{family_id}/{uuid}.{ext}'.
-- Parents upload/delete; the whole family can read their own family's photos.
drop policy if exists "update_photos_read"   on storage.objects;
drop policy if exists "update_photos_insert" on storage.objects;
drop policy if exists "update_photos_delete" on storage.objects;

create policy "update_photos_read" on storage.objects
  for select using (
    bucket_id = 'update-photos'
    and (storage.foldername(name))[1] = public.my_family_id()::text
  );
create policy "update_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'update-photos'
    and (storage.foldername(name))[1] = public.my_family_id()::text
    and public.is_parent()
  );
create policy "update_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'update-photos'
    and (storage.foldername(name))[1] = public.my_family_id()::text
    and public.is_parent()
  );
