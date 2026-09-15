-- 034_cares_and_shift_defaults.sql
-- Two things:
--  A) a SET shift pattern. shift_blocks are per ISO week and started every
--     week blank ("both" everywhere). shift_defaults holds the family's usual
--     week; ensure_shift_week() copies it into any week that has no blocks yet.
--     Seeded with the pattern in use as of Sep 2026 for every existing family.
--  B) Maisie's cares — a 4-hourly interactive round (nappy, mouth, eyes, skin
--     folds, probe swaps, temperature, reposition, NG + high-flow checks,
--     bedding) with position/foot memory, optional photos, and parent nudges:
--     "due" once per round and one "still waiting" after 45 min, from a sweep
--     that pg_cron runs every 5 minutes; "cares done" goes to the other parent.
--     Parents only, like Feeds.

-- ============ A) set shift pattern ============
create table if not exists public.shift_defaults (
  family_id   uuid not null references public.families(id) on delete cascade,
  day_name    text not null check (day_name in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  block_name  text not null check (block_name in ('AM','PM','Eve')),
  assignee    text not null default 'both'
                check (assignee in ('both','mum','dad','family','rest')),
  updated_at  timestamptz not null default now(),
  primary key (family_id, day_name, block_name)
);
alter table public.shift_defaults enable row level security;
drop policy if exists sd_select on public.shift_defaults;
create policy sd_select on public.shift_defaults
  for select using (family_id = public.my_family_id() and not public.is_team());
drop policy if exists sd_parents on public.shift_defaults;
create policy sd_parents on public.shift_defaults
  for all using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());

-- the family's usual week, as it stands in Sep 2026 (one family; on conflict
-- keep whatever they have already saved)
insert into public.shift_defaults (family_id, day_name, block_name, assignee)
select f.id, p.day_name, p.block_name, p.assignee
from public.families f
cross join (values
  ('Mon','AM','mum'), ('Mon','PM','dad'),  ('Mon','Eve','dad'),
  ('Tue','AM','mum'), ('Tue','PM','dad'),  ('Tue','Eve','dad'),
  ('Wed','AM','mum'), ('Wed','PM','dad'),  ('Wed','Eve','rest'),
  ('Thu','AM','mum'), ('Thu','PM','mum'),  ('Thu','Eve','dad'),
  ('Fri','AM','dad'), ('Fri','PM','dad'),  ('Fri','Eve','mum'),
  ('Sat','AM','both'),('Sat','PM','both'), ('Sat','Eve','both'),
  ('Sun','AM','dad'), ('Sun','PM','both'), ('Sun','Eve','rest')
) as p(day_name, block_name, assignee)
on conflict do nothing;

-- fill a week from the defaults if it has no blocks yet; returns rows written
create or replace function public.ensure_shift_week(p_week_key text)
returns int language plpgsql security definer set search_path = public as $$
declare v_fam uuid := public.my_family_id(); n int;
begin
  if v_fam is null or not public.is_parent() then return 0; end if;
  if exists (select 1 from public.shift_blocks where family_id = v_fam and week_key = p_week_key) then
    return 0;
  end if;
  insert into public.shift_blocks (family_id, week_key, day_name, block_name, assignee)
  select family_id, p_week_key, day_name, block_name, assignee
    from public.shift_defaults where family_id = v_fam
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- "make this week our usual pattern"
create or replace function public.save_shift_defaults(p_week_key text)
returns int language plpgsql security definer set search_path = public as $$
declare v_fam uuid := public.my_family_id(); n int;
begin
  if v_fam is null or not public.is_parent() then raise exception 'parents only'; end if;
  insert into public.shift_defaults (family_id, day_name, block_name, assignee, updated_at)
  select family_id, day_name, block_name, assignee, now()
    from public.shift_blocks where family_id = v_fam and week_key = p_week_key
  on conflict (family_id, day_name, block_name)
    do update set assignee = excluded.assignee, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- "put this week back to our usual pattern"
create or replace function public.reset_shift_week(p_week_key text)
returns int language plpgsql security definer set search_path = public as $$
declare v_fam uuid := public.my_family_id(); n int;
begin
  if v_fam is null or not public.is_parent() then raise exception 'parents only'; end if;
  insert into public.shift_blocks (family_id, week_key, day_name, block_name, assignee, updated_at)
  select family_id, p_week_key, day_name, block_name, assignee, now()
    from public.shift_defaults where family_id = v_fam
  on conflict (family_id, week_key, day_name, block_name)
    do update set assignee = excluded.assignee, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.ensure_shift_week(text) from public;
revoke all on function public.save_shift_defaults(text) from public;
revoke all on function public.reset_shift_week(text) from public;
grant execute on function public.ensure_shift_week(text)   to authenticated;
grant execute on function public.save_shift_defaults(text) to authenticated;
grant execute on function public.reset_shift_week(text)    to authenticated;

-- ============ B) cares ============
create table if not exists public.care_settings (
  family_id          uuid primary key references public.families(id) on delete cascade,
  round_interval_min int  not null default 240,   -- cares every 4h
  bedding_hours      int  not null default 24,    -- full change at least daily
  notify_due         boolean not null default true,
  overdue_after_min  int  not null default 45,
  updated_at         timestamptz not null default now()
);

create table if not exists public.care_rounds (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  started_by       uuid references public.profiles(id) on delete set null,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  completed_by     uuid references public.profiles(id) on delete set null,
  position         text check (position in ('left','back','right','prone')),
  foot             text check (foot in ('left','right')),
  temperature      numeric(3,1) check (temperature is null or temperature between 30 and 43),
  bedding_changed  boolean not null default false,
  note             text,
  photo_paths      text[] not null default '{}',
  created_at       timestamptz not null default now()
);
create index if not exists care_rounds_family_done
  on public.care_rounds (family_id, completed_at desc);

-- one row per ticked step in a round; the step list lives in the app
create table if not exists public.care_ticks (
  round_id  uuid not null references public.care_rounds(id) on delete cascade,
  key       text not null,
  done_by   uuid references public.profiles(id) on delete set null,
  done_at   timestamptz not null default now(),
  primary key (round_id, key)
);

alter table public.care_settings enable row level security;
alter table public.care_rounds   enable row level security;
alter table public.care_ticks    enable row level security;

drop policy if exists cs_parents on public.care_settings;
create policy cs_parents on public.care_settings for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());
drop policy if exists cr_parents on public.care_rounds;
create policy cr_parents on public.care_rounds for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());
drop policy if exists ct_parents on public.care_ticks;
create policy ct_parents on public.care_ticks for all
  using (exists (select 1 from public.care_rounds r
                  where r.id = round_id and r.family_id = public.my_family_id())
         and public.is_parent())
  with check (exists (select 1 from public.care_rounds r
                       where r.id = round_id and r.family_id = public.my_family_id())
              and public.is_parent());

-- cares done → the other parent hears, with the headline numbers
create or replace function public.notify_on_care_round()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text; v_first text; v_bits text[] := '{}';
begin
  if tg_op <> 'UPDATE' or new.completed_at is null or old.completed_at is not null then
    return new;
  end if;
  select display_name into v_who from public.profiles where id = new.completed_by;
  select split_part(baby_name, ' ', 1) into v_first from public.families where id = new.family_id;
  if new.temperature is not null then
    v_bits := v_bits || (new.temperature::text || '°C' ||
      case when new.temperature < 36.5 then ' (below 36.5)'
           when new.temperature > 37.5 then ' (above 37.5)' else '' end);
  end if;
  if new.position is not null then
    v_bits := v_bits || ('now on her ' ||
      case new.position when 'left' then 'left side' when 'right' then 'right side'
                        when 'back' then 'back' else 'front' end);
  end if;
  if new.bedding_changed then v_bits := v_bits || 'fresh bedding'::text; end if;
  insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
  values (new.family_id, 'parent', new.completed_by,
          coalesce(v_who, 'Someone') || ' did ' || coalesce(v_first, 'her') || '''s cares',
          coalesce(nullif(array_to_string(v_bits, ' · '), ''), 'all done'), '/cares');
  return new;
end $$;
drop trigger if exists trg_notify_care_round on public.care_rounds;
create trigger trg_notify_care_round after update on public.care_rounds
  for each row execute function public.notify_on_care_round();

-- the nudge sweep: cares are due one interval after the last completed round.
-- One "due" per round, one "still waiting" once it's 45 min past. Quiet until
-- the first round has ever been logged, so a family not using cares never
-- gets nagged. Idempotent — safe to run as often as you like.
create or replace function public.care_due_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare f record; v_last timestamptz; v_due timestamptz; v_note timestamptz;
        v_bed timestamptz; v_extra text; v_first text; sent int := 0;
begin
  for f in
    select fam.id as family_id, fam.baby_name,
           coalesce(cs.round_interval_min, 240) as mins,
           coalesce(cs.bedding_hours, 24)       as bed_hours,
           coalesce(cs.notify_due, true)        as notify_due,
           coalesce(cs.overdue_after_min, 45)   as late_min
    from public.families fam
    left join public.care_settings cs on cs.family_id = fam.id
  loop
    if not f.notify_due then continue; end if;
    select max(completed_at) into v_last from public.care_rounds
      where family_id = f.family_id and completed_at is not null;
    if v_last is null then continue; end if;
    v_due := v_last + make_interval(mins => f.mins);
    if now() < v_due then continue; end if;
    -- a round in progress is being dealt with — don't nag
    if exists (select 1 from public.care_rounds
                where family_id = f.family_id and completed_at is null
                  and started_at > v_last) then continue; end if;

    select max(created_at) into v_note from public.notifications
      where family_id = f.family_id
        and title in ('Cares due', 'Cares still waiting')
        and created_at > v_last;

    v_first := split_part(f.baby_name, ' ', 1);
    select max(completed_at) into v_bed from public.care_rounds
      where family_id = f.family_id and bedding_changed;
    v_extra := case when v_bed is null or v_bed < now() - make_interval(hours => f.bed_hours)
                    then ' · bedding change due too' else '' end;

    if v_note is null then
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (f.family_id, 'parent', null, 'Cares due',
              v_first || '''s cares were due at ' ||
              to_char(v_due at time zone 'Europe/London', 'HH24:MI') || v_extra, '/cares');
      sent := sent + 1;
    elsif now() >= v_due + make_interval(mins => f.late_min)
          and v_note < v_due + make_interval(mins => f.late_min) then
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (f.family_id, 'parent', null, 'Cares still waiting',
              v_first || '''s cares are ' || f.late_min || ' min past due' || v_extra, '/cares');
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;
revoke all on function public.care_due_sweep() from public;

-- run the sweep every 5 minutes. pg_cron has to be enabled in the dashboard
-- (Database → Extensions); if it isn't yet, this just notes it and moves on.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'care_due_sweep';
  perform cron.schedule('care_due_sweep', '*/5 * * * *', 'select public.care_due_sweep()');
  raise notice 'care_due_sweep scheduled every 5 minutes';
exception when others then
  raise notice 'pg_cron not available (%) — enable it under Database → Extensions, then re-run this migration', sqlerrm;
end $$;

alter publication supabase_realtime add table
  public.shift_defaults, public.care_settings, public.care_rounds, public.care_ticks;
