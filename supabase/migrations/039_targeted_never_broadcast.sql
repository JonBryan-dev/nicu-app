-- 039_targeted_never_broadcast.sql
-- A notification addressed to one person (recipient_id) used to carry that
-- person's role too, as a fallback for a notify function that didn't know
-- about recipient_id yet. In practice the fallback meant "Your visit is
-- confirmed" went to the whole family. Targeted rows now carry the role
-- 'one', which matches nobody — an old notify function finds no recipients
-- and sends nothing; the current one delivers to recipient_id alone.

alter table public.notifications drop constraint if exists notifications_recipient_role_check;
alter table public.notifications
  add constraint notifications_recipient_role_check
  check (recipient_role in ('parent', 'family', 'all', 'one'));
alter table public.notifications
  add constraint notifications_one_has_recipient
  check (recipient_role <> 'one' or recipient_id is not null);

create or replace function public.approve_visit_request(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.visit_requests;
        v_slot uuid; v_when text; v_name text;
begin
  if not public.is_parent() then raise exception 'parents only'; end if;
  select * into r from public.visit_requests
    where id = p_id and family_id = public.my_family_id();
  if not found then raise exception 'request not found'; end if;
  if r.status <> 'pending' then return null; end if;

  perform set_config('app.suppress_slot_notify', '1', true);
  insert into public.visit_slots (family_id, slot_date, start_time, end_time, booked_by)
    values (r.family_id, r.req_date, r.start_time, r.end_time, r.requested_by)
    returning id into v_slot;
  perform set_config('app.suppress_slot_notify', '0', true);

  update public.visit_requests set status = 'approved' where id = p_id;

  v_when := to_char(r.req_date, 'Dy DD Mon') || ' ' ||
            to_char(r.start_time, 'HH24:MI') || '–' || to_char(r.end_time, 'HH24:MI');
  select display_name into v_name from public.profiles where id = r.requested_by;

  -- the requester, and only the requester
  insert into public.notifications
    (family_id, recipient_role, recipient_id, actor_id, title, body, url)
  values (r.family_id, 'one', r.requested_by, auth.uid(),
          'Your visit is confirmed 🎉', v_when || ' — see you then 💛', '/visits');

  -- and the other parent
  insert into public.notifications
    (family_id, recipient_role, actor_id, title, body, url)
  values (r.family_id, 'parent', auth.uid(),
          coalesce(v_name, 'Someone') || ' is booked in to visit', v_when, '/visits');

  return v_slot;
end $$;
