-- 028_power_pump_time.sql
-- The daily power pump gets its own configurable fixed time (default 04:45 —
-- it used to be hard-pinned at 23:00 in the app). calendar_feed now returns
-- each feed's note so the schedule can tell which logged session was the
-- power pump.

alter table public.feed_settings
  add column if not exists power_pump_time time not null default '04:45';

create or replace function public.calendar_feed(p_token uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_family public.families;
        v_today date := (now() at time zone 'Europe/London')::date;
begin
  select * into v_family from public.families where calendar_token = p_token;
  if not found then raise exception 'not found'; end if;
  return json_build_object(
    'baby_name', v_family.baby_name,
    'settings', (select row_to_json(s) from public.feed_settings s where s.family_id = v_family.id),
    'sleep_windows', (select coalesce(json_agg(row_to_json(w)), '[]'::json)
        from public.sleep_windows w where w.family_id = v_family.id),
    'feeds_today', (select coalesce(json_agg(json_build_object(
          'started_at', f.started_at, 'ended_at', f.ended_at, 'ml', f.ml, 'note', f.note) order by f.started_at), '[]'::json)
        from public.feeds f
        where f.family_id = v_family.id
          and (f.started_at at time zone 'Europe/London')::date = v_today),
    'slots', (select coalesce(json_agg(json_build_object(
          'slot_date', s.slot_date, 'start_time', s.start_time, 'end_time', s.end_time,
          'booker', (select display_name from public.profiles p where p.id = s.booked_by)
        ) order by s.slot_date, s.start_time), '[]'::json)
        from public.visit_slots s
        where s.family_id = v_family.id and s.slot_date >= v_today and s.slot_date < v_today + 14),
    'tasks', (select coalesce(json_agg(json_build_object(
          'task_text', t.task_text,
          'claimer', (select display_name from public.profiles p where p.id = t.claimed_by),
          'slot', (select json_build_object('slot_date', vs.slot_date, 'start_time', vs.start_time, 'end_time', vs.end_time)
                   from public.visit_slots vs where vs.id = t.slot_id)
        )), '[]'::json)
        from public.support_tasks t
        where t.family_id = v_family.id and t.claimed_by is not null and t.at_hospital)
  );
end $$;
