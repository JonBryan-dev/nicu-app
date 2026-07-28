-- 011_plan_history.sql
-- Track changes to the feeding/pumping plan over time (ml per feed creeping
-- up as baby grows, interval changes, pump targets). One row per save.

create table if not exists public.feed_plan_history (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families(id) on delete cascade,
  changed_by        uuid references public.profiles(id) on delete set null,
  baby_interval_min int,
  baby_ml           int,
  feeds_per_day     int,
  interval_night_min int,
  target_ml         int,
  changed_at        timestamptz not null default now()
);
create index if not exists plan_history_family on public.feed_plan_history (family_id, changed_at desc);

alter table public.feed_plan_history enable row level security;
create policy plan_hist_parents on public.feed_plan_history for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());
