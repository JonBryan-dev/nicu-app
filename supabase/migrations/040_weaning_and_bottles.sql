-- 040_weaning_and_bottles.sql
-- Two new chapters in feeding:
--  A) Weaning off the pump. Switch it on, pick a stop date, and the Feeds
--     tab lays out a gentle step-down — one fewer pump every few days from
--     the count at the start to zero — and the pumping planner follows it.
--  B) Bottle feeding. A SALT target (ml per bottle × times a day) alongside
--     the NG plan; each feed tick records how it went in (NG / bottle /
--     breast) and how much by mouth, so the Cares tab can track the climb.
alter table public.feed_settings
  add column if not exists weaning          boolean not null default false,
  add column if not exists wean_target      date,
  add column if not exists wean_started     date,
  add column if not exists wean_start_count int check (wean_start_count is null or wean_start_count between 1 and 16),
  add column if not exists bottle_ml        double precision check (bottle_ml is null or bottle_ml between 0 and 500),
  add column if not exists bottle_per_day   int check (bottle_per_day is null or bottle_per_day between 0 and 24);

alter table public.feed_ticks
  add column if not exists method  text not null default 'ng'
    check (method in ('ng', 'bottle', 'breast', 'mixed')),
  add column if not exists oral_ml double precision
    check (oral_ml is null or oral_ml between 0 and 500);
