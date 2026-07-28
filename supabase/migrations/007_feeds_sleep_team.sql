-- 007_feeds_sleep_team.sql
-- Feeding schedule + protected sleep + supply/demand, NICU 'team' role,
-- hospital-linked support jobs, calendar subscription token, and
-- parents-only RLS for daily/weekly lists.

-- ============ helpers ============
create or replace function public.is_team()
returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role from public.profiles where id = auth.uid()) = 'team', false) $$;

-- ============ team role + new family columns ============
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('parent','family','team'));

alter table public.families
  add column if not exists team_code text unique default upper(substr(md5(random()::text),1,6));
alter table public.families
  add column if not exists calendar_token uuid not null default gen_random_uuid();

-- join_family now recognises the team code; create_family returns it
create or replace function public.join_family(
  p_code text, p_display_name text
) returns json language plpgsql security definer set search_path = public as $$
declare v_family public.families; v_role text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'already in a family';
  end if;
  select * into v_family from public.families
    where parent_code = upper(trim(p_code))
       or family_code = upper(trim(p_code))
       or team_code   = upper(trim(p_code));
  if not found then raise exception 'invalid invite code'; end if;
  v_role := case
    when v_family.parent_code = upper(trim(p_code)) then 'parent'
    when v_family.team_code   = upper(trim(p_code)) then 'team'
    else 'family' end;
  insert into public.profiles (id, family_id, display_name, role)
    values (auth.uid(), v_family.id, trim(p_display_name), v_role);
  return json_build_object('family_id', v_family.id, 'role', v_role);
end $$;

create or replace function public.create_family(
  p_baby_name text, p_baby_dob date, p_display_name text
) returns json language plpgsql security definer set search_path = public as $$
declare v_family public.families;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'already in a family';
  end if;
  insert into public.families (baby_name, baby_dob)
    values (trim(p_baby_name), p_baby_dob) returning * into v_family;
  insert into public.profiles (id, family_id, display_name, role)
    values (auth.uid(), v_family.id, trim(p_display_name), 'parent');
  return json_build_object(
    'family_id', v_family.id,
    'parent_code', v_family.parent_code,
    'family_code', v_family.family_code,
    'team_code', v_family.team_code);
end $$;

-- ============ feeding tables (parents only) ============
create table if not exists public.feed_settings (
  family_id uuid primary key references public.families(id) on delete cascade,
  interval_day_min  int not null default 180 check (interval_day_min between 60 and 360),
  interval_night_min int check (interval_night_min between 60 and 360),
  day_from   time not null default '08:00',
  night_from time not null default '20:00',
  target_ml  int check (target_ml between 1 and 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.sleep_windows (
  family_id  uuid not null references public.families(id) on delete cascade,
  person     text not null check (person in ('mum','dad')),
  start_time time not null,
  end_time   time not null,
  primary key (family_id, person)
);

create table if not exists public.feeds (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  fed_by     uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  ml         int check (ml between 0 and 500),
  method     text not null default 'bottle' check (method in ('breast','bottle','ngt','other')),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists feeds_family_started on public.feeds (family_id, started_at desc);

create table if not exists public.expressing_logs (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  logged_by  uuid references public.profiles(id) on delete set null,
  at         timestamptz not null default now(),
  ml         int not null check (ml between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists expressing_family_at on public.expressing_logs (family_id, at desc);

alter table public.feed_settings    enable row level security;
alter table public.sleep_windows    enable row level security;
alter table public.feeds            enable row level security;
alter table public.expressing_logs  enable row level security;

create policy fs_parents on public.feed_settings for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());
create policy sw_parents on public.sleep_windows for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());
create policy feeds_parents on public.feeds for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());
create policy expr_parents on public.expressing_logs for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());

alter publication supabase_realtime add table
  public.feeds, public.expressing_logs, public.sleep_windows, public.feed_settings;

-- ============ support jobs: hospital flag + linked slot ============
alter table public.support_tasks
  add column if not exists at_hospital boolean not null default false;
alter table public.support_tasks
  add column if not exists slot_id uuid references public.visit_slots(id) on delete set null;

-- family may set slot_id on their own claim, but not at_hospital/text/etc.
create or replace function public.guard_support_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_parent() then return new; end if;
  if new.task_text is distinct from old.task_text
     or new.family_id is distinct from old.family_id
     or new.created_by is distinct from old.created_by
     or new.at_hospital is distinct from old.at_hospital then
    raise exception 'not allowed';
  end if;
  if new.claimed_by is distinct from old.claimed_by then
    if not ( (old.claimed_by is null and new.claimed_by = auth.uid())
          or (old.claimed_by = auth.uid() and new.claimed_by is null) ) then
      raise exception 'you can only claim a free job or un-claim your own';
    end if;
  end if;
  return new;
end $$;

-- ============ RLS updates: team sees updates only; lists are parents-only ============
-- team may post updates (and delete their own); parents unchanged
drop policy upd_insert on public.updates;
create policy upd_insert on public.updates
  for insert with check (
    family_id = public.my_family_id()
    and author_id = auth.uid()
    and (public.is_parent() or public.is_team())
  );
drop policy upd_delete on public.updates;
create policy upd_delete on public.updates
  for delete using (
    family_id = public.my_family_id()
    and (public.is_parent() or (public.is_team() and author_id = auth.uid()))
  );

-- exclude team from everything that isn't the updates feed
drop policy sup_select on public.support_tasks;
create policy sup_select on public.support_tasks
  for select using (family_id = public.my_family_id() and not public.is_team());
drop policy sup_update on public.support_tasks;
create policy sup_update on public.support_tasks
  for update using (family_id = public.my_family_id() and not public.is_team());
drop policy slot_select on public.visit_slots;
create policy slot_select on public.visit_slots
  for select using (family_id = public.my_family_id() and not public.is_team());
drop policy slot_update on public.visit_slots;
create policy slot_update on public.visit_slots
  for update using (family_id = public.my_family_id() and not public.is_team());
drop policy tpl_select on public.checklist_templates;
create policy tpl_select on public.checklist_templates
  for select using (family_id = public.my_family_id() and not public.is_team());
drop policy shift_select on public.shift_blocks;
create policy shift_select on public.shift_blocks
  for select using (family_id = public.my_family_id() and not public.is_team());
drop policy care_select on public.care_logs;
create policy care_select on public.care_logs
  for select using (family_id = public.my_family_id() and not public.is_team());
drop policy notif_select on public.notifications;
create policy notif_select on public.notifications
  for select using (family_id = public.my_family_id() and not public.is_team());

-- daily/weekly lists: parents only; wellbeing/respite stay visible to family
drop policy itm_select on public.checklist_items;
create policy itm_select on public.checklist_items
  for select using (
    family_id = public.my_family_id()
    and not public.is_team()
    and (public.is_parent() or list_type not in ('daily','weekly'))
  );

-- photos: team can upload too (their update photos)
drop policy if exists "update_photos_insert" on storage.objects;
create policy "update_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'update-photos'
    and (storage.foldername(name))[1] = public.my_family_id()::text
    and (public.is_parent() or public.is_team())
  );

-- team must NOT read the families row (it contains the parent invite code);
-- they get a name/dob summary via RPC instead
drop policy fam_select on public.families;
create policy fam_select on public.families
  for select using (id = public.my_family_id() and not public.is_team());
create or replace function public.my_family_summary()
returns json language sql stable security definer set search_path = public as
$$ select json_build_object('id', f.id, 'baby_name', f.baby_name, 'baby_dob', f.baby_dob)
   from public.families f where f.id = public.my_family_id() $$;

-- ============ calendar subscription feed ============
-- Read-only JSON for the ICS route, gated by the family's secret token.
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
          'started_at', f.started_at, 'ended_at', f.ended_at, 'ml', f.ml) order by f.started_at), '[]'::json)
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
