-- 023_feeds_side_split.sql
-- Optional left/right breast split on a pump/expressing session. `ml` stays the
-- total (the app writes ml_left + ml_right into it when a split is given), so
-- every existing total and the supply maths keep working unchanged. Duration is
-- read from started_at → ended_at, so no column is needed for it.
alter table public.feeds
  add column if not exists ml_left  int check (ml_left  between 0 and 500),
  add column if not exists ml_right int check (ml_right between 0 and 500);
