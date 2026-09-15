-- 035_feed_ticks.sql
-- Feed reminders + a one-tap "Fed" tick, on the ward's FIXED grid
-- (feed_settings.baby_first_feed + baby_interval_min — e.g. 08:00 every 2h),
-- not "two hours after the last one": a feed ten minutes late doesn't shift
-- the rest of the day. One "Feed time" per slot, one "still waiting" after
-- 30 min, nothing once the slot is ticked. Quiet until the first tick ever,
-- so switching it on is: tick one feed. The tick is the unit of the day's
-- gamification (dots, on-time count, streak) in the Cares tab.

alter table public.care_settings
  add column if not exists notify_feeds  boolean not null default true,
  add column if not exists feed_late_min int     not null default 30;

create table if not exists public.feed_ticks (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  due_at     timestamptz not null,               -- the slot on the grid
  done_at    timestamptz not null default now(),
  done_by    uuid references public.profiles(id) on delete set null,
  ml         double precision check (ml is null or ml between 0 and 500),
  note       text,
  unique (family_id, due_at)
);
create index if not exists feed_ticks_family_due on public.feed_ticks (family_id, due_at desc);

alter table public.feed_ticks enable row level security;
drop policy if exists ft_parents on public.feed_ticks;
create policy ft_parents on public.feed_ticks for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());

create or replace function public.feed_due_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare f record; v_now_l timestamp; v_slot_l timestamp; v_slot timestamptz;
        v_note timestamptz; v_first text; sent int := 0;
begin
  v_now_l := now() at time zone 'Europe/London';
  for f in
    select fam.id as family_id, fam.baby_name, fs.baby_first_feed, fs.baby_interval_min,
           coalesce(cs.notify_feeds, true) as notify_feeds,
           coalesce(cs.feed_late_min, 30)  as late_min
    from public.families fam
    join public.feed_settings fs on fs.family_id = fam.id
    left join public.care_settings cs on cs.family_id = fam.id
    where fs.baby_first_feed is not null and fs.baby_interval_min is not null
  loop
    if not f.notify_feeds then continue; end if;
    if not exists (select 1 from public.feed_ticks where family_id = f.family_id) then continue; end if;

    -- the current slot: most recent grid time at or before now (London)
    select max(t) into v_slot_l
      from generate_series((v_now_l::date - 1) + f.baby_first_feed,
                           (v_now_l::date + 1) + f.baby_first_feed,
                           make_interval(mins => f.baby_interval_min)) as t
     where t <= v_now_l;
    if v_slot_l is null then continue; end if;
    if v_now_l >= v_slot_l + make_interval(mins => f.baby_interval_min) then continue; end if;
    v_slot := v_slot_l at time zone 'Europe/London';
    if exists (select 1 from public.feed_ticks where family_id = f.family_id and due_at = v_slot) then continue; end if;

    select max(created_at) into v_note from public.notifications
      where family_id = f.family_id
        and title in ('Feed time', 'Feed still waiting')
        and created_at >= v_slot;
    v_first := split_part(f.baby_name, ' ', 1);

    if v_note is null then
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (f.family_id, 'parent', null, 'Feed time',
              v_first || '''s ' || to_char(v_slot_l, 'HH24:MI') || ' feed — tick it when she''s had it', '/cares');
      sent := sent + 1;
    elsif v_now_l >= v_slot_l + make_interval(mins => f.late_min)
          and v_note < (v_slot_l + make_interval(mins => f.late_min)) at time zone 'Europe/London' then
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (f.family_id, 'parent', null, 'Feed still waiting',
              v_first || '''s ' || to_char(v_slot_l, 'HH24:MI') || ' feed is ' || f.late_min || ' min past', '/cares');
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;
revoke all on function public.feed_due_sweep() from public;

-- alongside the cares sweep, every 5 minutes (same pg_cron caveat as 034)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'feed_due_sweep';
  perform cron.schedule('feed_due_sweep', '*/5 * * * *', 'select public.feed_due_sweep()');
  raise notice 'feed_due_sweep scheduled every 5 minutes';
exception when others then
  raise notice 'pg_cron not available (%) — enable it under Database → Extensions, then re-run this migration', sqlerrm;
end $$;

alter publication supabase_realtime add table public.feed_ticks;
