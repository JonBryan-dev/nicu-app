-- 003_functions_triggers.sql — RPCs, guards, notification outbox triggers

-- ============ onboarding RPCs ============

-- First parent creates the family (also creates their profile + seeds templates via trigger in 004)
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
    'family_code', v_family.family_code);
end $$;

-- Join by invite code; role derives from which code was used
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
    where parent_code = upper(trim(p_code)) or family_code = upper(trim(p_code));
  if not found then raise exception 'invalid invite code'; end if;
  v_role := case when v_family.parent_code = upper(trim(p_code)) then 'parent' else 'family' end;
  insert into public.profiles (id, family_id, display_name, role)
    values (auth.uid(), v_family.id, trim(p_display_name), v_role);
  return json_build_object('family_id', v_family.id, 'role', v_role);
end $$;

-- ============ period item generation ============
-- Idempotent: copies templates into checklist_items for the given period.
create or replace function public.ensure_period_items(
  p_list_type text, p_scope_key text
) returns void language plpgsql security definer set search_path = public as $$
declare v_family uuid := public.my_family_id();
begin
  if v_family is null then raise exception 'no profile'; end if;
  insert into public.checklist_items (family_id, list_type, scope_key, template_id, item_text, sort_order)
  select t.family_id, t.list_type, p_scope_key, t.id, t.item_text, t.sort_order
  from public.checklist_templates t
  where t.family_id = v_family and t.list_type = p_list_type
  on conflict (family_id, list_type, scope_key, template_id) do nothing;
end $$;

-- Family-role users may toggle 'done' on checklist items? No — parents only (RLS).
-- But is_parent() covers it; nothing extra needed here.

-- ============ nudge RPC (parents ask family to cover a task) ============
create or replace function public.nudge_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_task public.support_tasks; v_baby text;
begin
  if not public.is_parent() then raise exception 'parents only'; end if;
  select * into v_task from public.support_tasks
    where id = p_task_id and family_id = public.my_family_id();
  if not found then raise exception 'task not found'; end if;
  select baby_name into v_baby from public.families where id = v_task.family_id;
  insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
  values (v_task.family_id, 'family', auth.uid(),
          'Can anyone cover this?',
          v_task.task_text || ' — open ' || v_baby || '''s app and tap "I''ll do this"',
          '/support');
end $$;

-- ============ guard triggers (column-level restrictions for family role) ============

create or replace function public.guard_support_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_parent() then return new; end if;
  -- family members: only the claimed_by column may change, and only to/from themselves
  if new.task_text is distinct from old.task_text
     or new.family_id is distinct from old.family_id
     or new.created_by is distinct from old.created_by then
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
create trigger trg_guard_support before update on public.support_tasks
  for each row execute function public.guard_support_update();

create or replace function public.guard_slot_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_parent() then return new; end if;
  if new.slot_date is distinct from old.slot_date
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.family_id is distinct from old.family_id then
    raise exception 'not allowed';
  end if;
  if new.booked_by is distinct from old.booked_by then
    if not ( (old.booked_by is null and new.booked_by = auth.uid())
          or (old.booked_by = auth.uid() and new.booked_by is null) ) then
      raise exception 'you can only book a free slot or cancel your own booking';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_slot before update on public.visit_slots
  for each row execute function public.guard_slot_update();

-- ============ notification outbox triggers ============

create or replace function public.notify_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_baby text; v_author text;
begin
  select baby_name into v_baby from public.families where id = new.family_id;
  select display_name into v_author from public.profiles where id = new.author_id;
  insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
  values (new.family_id, 'all', new.author_id,
          case when new.is_milestone then '✦ A milestone for ' || v_baby || '!'
               else v_author || ' posted an update' end,
          left(new.body, 140), '/');
  return new;
end $$;
create trigger trg_notify_update after insert on public.updates
  for each row execute function public.notify_on_update();

create or replace function public.notify_on_task_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
    values (new.family_id, 'family', new.created_by,
            'New job needs cover', new.task_text, '/support');
  elsif tg_op = 'UPDATE' and new.claimed_by is distinct from old.claimed_by then
    if new.claimed_by is not null then
      select display_name into v_name from public.profiles where id = new.claimed_by;
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'parent', new.claimed_by,
              v_name || ' will handle a job', new.task_text, '/support');
    else
      select display_name into v_name from public.profiles where id = old.claimed_by;
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'parent', old.claimed_by,
              coalesce(v_name,'Someone') || ' un-claimed a job', new.task_text, '/support');
    end if;
  end if;
  return new;
end $$;
create trigger trg_notify_task after insert or update on public.support_tasks
  for each row execute function public.notify_on_task_change();

create or replace function public.notify_on_slot_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_when text;
begin
  v_when := to_char(new.slot_date, 'Dy DD Mon') || ' ' ||
            to_char(new.start_time, 'HH24:MI') || '–' || to_char(new.end_time, 'HH24:MI');
  if tg_op = 'INSERT' then
    insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
    values (new.family_id, 'family', null,
            'New visiting slot', v_when || ' — first to book gets it', '/visits');
  elsif tg_op = 'UPDATE' and new.booked_by is distinct from old.booked_by then
    if new.booked_by is not null then
      select display_name into v_name from public.profiles where id = new.booked_by;
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'parent', new.booked_by,
              v_name || ' booked a visit', v_when, '/visits');
    else
      select display_name into v_name from public.profiles where id = old.booked_by;
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'parent', old.booked_by,
              coalesce(v_name,'Someone') || ' cancelled a visit', v_when, '/visits');
    end if;
  end if;
  return new;
end $$;
create trigger trg_notify_slot after insert or update on public.visit_slots
  for each row execute function public.notify_on_slot_change();
