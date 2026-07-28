-- 010_unit_feeds_pumping.sql
-- The unit feeds baby on a ward-set schedule; parents are on a pumping
-- schedule. feed_settings gains the unit's plan for baby (first feed,
-- interval, ml per feed); the existing feeds/gaps/sleep machinery now
-- drives the parents' pumping.

alter table public.feed_settings
  add column if not exists baby_first_feed time,
  add column if not exists baby_interval_min int check (baby_interval_min between 60 and 360),
  add column if not exists baby_ml int check (baby_ml between 1 and 500);
