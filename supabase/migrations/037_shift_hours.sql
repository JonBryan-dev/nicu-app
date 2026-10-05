-- 037_shift_hours.sql
-- Shifts get strict hours. Outside them — or in a block marked Rest/Family —
-- nobody's on and the nurses have her: nothing then is held against a
-- parent, and no reminder fires. parent_on_at() is the one rule, used by
-- both sweeps here and mirrored in the app for scoring.
--   AM 07:00–13:00 · PM 13:00–18:00 · Eve 18:00–22:00 by default; editable
--   on the Rest tab. A cares round due in nurses' time becomes due when the
--   next parent shift starts.

alter table public.care_settings
  add column if not exists am_from  time not null default '07:00',
  add column if not exists am_to    time not null default '13:00',
  add column if not exists pm_from  time not null default '13:00',
  add column if not exists pm_to    time not null default '18:00',
  add column if not exists eve_from time not null default '18:00',
  add column if not exists eve_to   time not null default '22:00';

-- is a parent on at this moment? (London time; this week's rota, else the
-- usual pattern, else "both")
create or replace function public.parent_on_at(p_family uuid, p_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare l timestamp := p_at at time zone 'Europe/London';
        wk text; dn text; t time; cs public.care_settings; blk text; a text;
begin
  wk := to_char(l, 'IYYY-"W"IW');
  dn := to_char(l, 'Dy');
  t  := l::time;
  select * into cs from public.care_settings where family_id = p_family;
  if    t >= coalesce(cs.am_from,  '07:00') and t < coalesce(cs.am_to,  '13:00') then blk := 'AM';
  elsif t >= coalesce(cs.pm_from,  '13:00') and t < coalesce(cs.pm_to,  '18:00') then blk := 'PM';
  elsif t >= coalesce(cs.eve_from, '18:00') and t < coalesce(cs.eve_to, '22:00') then blk := 'Eve';
  else return false;
  end if;
  select assignee into a from public.shift_blocks
    where family_id = p_family and week_key = wk and day_name = dn and block_name = blk;
  if a is null then
    select assignee into a from public.shift_defaults
      where family_id = p_family and day_name = dn and block_name = blk;
  end if;
  return coalesce(a, 'both') in ('mum', 'dad', 'both');
end $$;

-- the first moment at or after p_from when a parent is on (15-min steps,
-- up to two days; falls back to p_from)
create or replace function public.next_parent_on(p_family uuid, p_from timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare t timestamptz := p_from; i int := 0;
begin
  while i < 192 loop
    if public.parent_on_at(p_family, t) then return t; end if;
    t := t + interval '15 minutes';
    i := i + 1;
  end loop;
  return p_from;
end $$;

-- cares sweep: due moves to the next parent shift; nudges only while one is on
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
    if not public.parent_on_at(f.family_id, now()) then continue; end if;
    select max(completed_at) into v_last from public.care_rounds
      where family_id = f.family_id and completed_at is not null;
    if v_last is null then continue; end if;
    v_due := public.next_parent_on(f.family_id, v_last + make_interval(mins => f.mins));
    if now() < v_due then continue; end if;
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

-- feed sweep: a slot in nurses' time is theirs — no reminder
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

    select max(t) into v_slot_l
      from generate_series((v_now_l::date - 1) + f.baby_first_feed,
                           (v_now_l::date + 1) + f.baby_first_feed,
                           make_interval(mins => f.baby_interval_min)) as t
     where t <= v_now_l;
    if v_slot_l is null then continue; end if;
    if v_now_l >= v_slot_l + make_interval(mins => f.baby_interval_min) then continue; end if;
    v_slot := v_slot_l at time zone 'Europe/London';
    if not public.parent_on_at(f.family_id, v_slot) then continue; end if;
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
