-- 032_resp_events.sql
-- Dad's private respiratory log, behind the "Lungs" tab.
--
-- Most of the breathing timeline is DERIVED, not stored. gas_entries (028)
-- already carries support_mode and taken_at on every gas sample, so the support
-- ladder — intubations (a move to 'vent'), extubations (a move down from
-- 'vent'), reintubations (the second and later moves to 'vent'), days on the
-- ventilator, step-ups and step-downs — all fall out of rows he is already
-- logging. lib/respTimeline.ts computes them; none of it is duplicated here.
--
-- This table is only for what a gas sample cannot express: the exact hour of an
-- extubation when no gas was taken near it, a surfactant dose, the day caffeine
-- started or stopped, a steroid course, a planned extubation trial (an
-- intention, before any mode has changed), events from before he started
-- logging gases, and his own words about any of them.
--
-- PRIVATE TO ITS AUTHOR. Unlike journal_entries (022), which both parents
-- share, every policy here is author_id = auth.uid(). This is one parent's
-- reading corner, and client-side tab hiding is not trusted to keep it that
-- way. family_id is kept so rows cascade with the family and so the existing
-- useRealtime filter (family_id=eq.…) works unchanged. If this should ever
-- become "our" log, widen the using/with check clauses to my_family_id() and
-- is_parent() — nothing else has to change.
--
-- No clinical identifiers: an event type, a timestamp, and free text.

create table if not exists public.resp_events (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  author_id   uuid not null default auth.uid()
                references public.profiles(id) on delete cascade,
  kind        text not null check (kind in (
                'intubation','extubation','extubation_trial','reintubation',
                'surfactant','caffeine_start','caffeine_stop',
                'steroid_start','steroid_stop','mode_change','other')),
  at          timestamptz not null default now(),
  detail      text,   -- 'dose 2', 'planned trial', the mode moved to, …
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists resp_events_by_author
  on public.resp_events (author_id, at desc);

alter table public.resp_events enable row level security;
create policy resp_own on public.resp_events for all
  using      (author_id = auth.uid() and family_id = public.my_family_id() and public.is_parent())
  with check (author_id = auth.uid() and family_id = public.my_family_id() and public.is_parent());

-- Questions he actually put to the team (and what they said), plus reviews he
-- pinned. Same owner-only rule. 'ref' is a PMID for a pinned review, or the
-- question's id from lib/evidence.ts.
create table if not exists public.evidence_notes (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  author_id   uuid not null default auth.uid()
                references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('question','pin')),
  topic       text,
  ref         text,
  title       text not null,   -- the question as asked, or the review title
  body        text,            -- what the team said
  created_at  timestamptz not null default now()
);
create index if not exists evidence_notes_by_author
  on public.evidence_notes (author_id, created_at desc);

alter table public.evidence_notes enable row level security;
create policy evnotes_own on public.evidence_notes for all
  using      (author_id = auth.uid() and family_id = public.my_family_id() and public.is_parent())
  with check (author_id = auth.uid() and family_id = public.my_family_id() and public.is_parent());

-- his phone and his laptop, in sync — same reason every other table is here
alter publication supabase_realtime add table public.resp_events;
alter publication supabase_realtime add table public.evidence_notes;
