-- 030_journal_kinds.sql
-- The private mum & dad journal grows into a "Journal" tab. One table, several
-- kinds of entry, all parents-only via the existing RLS:
--   journal  — free notes (as before)
--   vent     — issues with nurses/doctors/the unit, off the family feed
--   question — a "today's question for the team" they asked + the answer
--   mood     — daily wellbeing check-in (rough day / okay / good day)
alter table public.journal_entries
  add column if not exists kind text not null default 'journal'
    check (kind in ('journal','vent','question','mood')),
  add column if not exists title text; -- e.g. the question asked, or the mood prompt
create index if not exists journal_by_kind
  on public.journal_entries (family_id, kind, created_at desc);
