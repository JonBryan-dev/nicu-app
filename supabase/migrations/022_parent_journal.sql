-- 022_parent_journal.sql
-- A private journal for mum & dad only — a quiet space off the family feed for
-- the hard days, the wins, the things they don't want to forget. Parents-only
-- via RLS (is_parent); family and the NICU team can never see it. No push.
-- Shared between the two parents ("our journal"): both read all entries, each
-- deletes only their own.

create table if not exists public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists journal_by_family
  on public.journal_entries (family_id, created_at desc);

alter table public.journal_entries enable row level security;

create policy jrnl_select on public.journal_entries
  for select using (family_id = public.my_family_id() and public.is_parent());
create policy jrnl_insert on public.journal_entries
  for insert with check (
    family_id = public.my_family_id() and public.is_parent() and author_id = auth.uid()
  );
create policy jrnl_delete on public.journal_entries
  for delete using (family_id = public.my_family_id() and author_id = auth.uid());

-- keep both parents' phones in sync
alter publication supabase_realtime add table public.journal_entries;
