-- 009_feeds_v2.sql
-- Feeding refinements from real use:
--  * 'pump' as a feed method (its ml counts as expressed supply, not intake)
--  * auto-calculated day gaps: plan is "feeds per 24h" + overnight stretch
--  * multiple protected-sleep windows per parent (sleep → pump → sleep)

-- pump method
alter table public.feeds drop constraint feeds_method_check;
alter table public.feeds add constraint feeds_method_check
  check (method in ('breast','bottle','pump','ngt','other'));

-- feeds-per-day drives auto day spacing (null = legacy fixed intervals)
alter table public.feed_settings
  add column if not exists feeds_per_day int check (feeds_per_day between 4 and 16);

-- sleep windows: several per person
alter table public.sleep_windows drop constraint sleep_windows_pkey;
alter table public.sleep_windows
  add column id uuid primary key default gen_random_uuid();
