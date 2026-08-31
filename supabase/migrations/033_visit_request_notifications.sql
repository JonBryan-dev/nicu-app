-- 033_visit_request_notifications.sql
-- Approving a visit request told nobody in particular: the requester only ever
-- saw the generic family-wide "someone is booked in" broadcasts, and approval
-- was three client calls (insert slot → book it → mark approved) that could
-- half-finish. This:
--   1) lets a notification target ONE person (recipient_id) as well as a role,
--   2) makes approval a single atomic RPC,
--   3) suppresses the slot's own broadcasts during that RPC, so an approval is
--      one clear "Your visit is confirmed 🎉" to the person who asked.
-- Declines stay quiet by design — the requester sees the status in Visits.

-- 1) person-targeted notifications ------------------------------------------
alter table public.notifications
  add column if not exists recipient_id uuid
    references public.profiles(id) on delete cascade;

-- 2) slot notifications, with a transaction-local mute --------------------
-- (same as 021, plus the suppression check — the approval RPC sends its own)
create or replace function public.notify_on_slot_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_when text;
        booked_now boolean; booked_before boolean;
begin
  if coalesce(current_setting('app.suppress_slot_notify', true), '') = '1' then
    return new;
  end if;

  v_when := to_char(new.slot_date, 'Dy DD Mon') || ' ' ||
            to_char(new.start_time, 'HH24:MI') || '–' || to_char(new.end_time, 'HH24:MI');
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.notifications n
      where n.family_id = new.family_id
        and n.title = 'New visiting slot'
        and n.created_at >= now() - interval '15 seconds'
    ) then
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'family', null,
              'New visiting slot', v_when || ' — first to book gets it', '/visits');
    end if;
    return new;
  end if;

  booked_now    := new.booked_by is not null or new.booked_name is not null;
  booked_before := old.booked_by is not null or old.booked_name is not null;
  if booked_now = booked_before then return new; end if;

  v_name := coalesce(
    (select display_name from public.profiles
       where id = coalesce(new.booked_by, old.booked_by)),
    new.booked_name, old.booked_name, 'Someone');

  if booked_now then
    if auth.uid() = new.booked_by then
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'parent', new.booked_by, v_name || ' booked a visit', v_when, '/visits');
    else
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'family', auth.uid(), v_name || ' is booked in to visit', v_when, '/visits');
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'parent', auth.uid(), v_name || ' is booked in to visit', v_when, '/visits');
    end if;
  else
    if auth.uid() = old.booked_by then
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'parent', old.booked_by,
              coalesce(v_name,'Someone') || ' cancelled a visit', v_when, '/visits');
    else
      insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
      values (new.family_id, 'family', auth.uid(),
              coalesce(v_name,'Someone') || '''s visit was cancelled', v_when, '/visits');
    end if;
  end if;
  return new;
end $$;

-- 3) approve in one go, and tell the person who asked ------------------------
create or replace function public.approve_visit_request(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.visit_requests;
        v_slot uuid; v_when text; v_role text; v_name text;
begin
  if not public.is_parent() then raise exception 'parents only'; end if;
  select * into r from public.visit_requests
    where id = p_id and family_id = public.my_family_id();
  if not found then raise exception 'request not found'; end if;
  if r.status <> 'pending' then return null; end if;

  -- open the slot with them already booked in, quietly
  perform set_config('app.suppress_slot_notify', '1', true);
  insert into public.visit_slots (family_id, slot_date, start_time, end_time, booked_by)
    values (r.family_id, r.req_date, r.start_time, r.end_time, r.requested_by)
    returning id into v_slot;
  perform set_config('app.suppress_slot_notify', '0', true);

  update public.visit_requests set status = 'approved' where id = p_id;

  v_when := to_char(r.req_date, 'Dy DD Mon') || ' ' ||
            to_char(r.start_time, 'HH24:MI') || '–' || to_char(r.end_time, 'HH24:MI');
  select display_name, role into v_name, v_role
    from public.profiles where id = r.requested_by;

  -- the requester, by name. recipient_role is kept in step with their own role
  -- so this still lands even if the notify function hasn't been redeployed yet.
  insert into public.notifications
    (family_id, recipient_role, recipient_id, actor_id, title, body, url)
  values (r.family_id, coalesce(v_role, 'family'), r.requested_by, auth.uid(),
          'Your visit is confirmed 🎉', v_when || ' — see you then 💛', '/visits');

  -- and the other parent, so both phones agree
  insert into public.notifications
    (family_id, recipient_role, actor_id, title, body, url)
  values (r.family_id, 'parent', auth.uid(),
          coalesce(v_name, 'Someone') || ' is booked in to visit', v_when, '/visits');

  return v_slot;
end $$;

revoke all on function public.approve_visit_request(uuid) from public;
grant execute on function public.approve_visit_request(uuid) to authenticated;
