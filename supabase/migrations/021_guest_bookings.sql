-- 021_guest_bookings.sql
-- Parents can book a non-member visitor by name. `booked_name` holds a guest
-- (booked_by stays null); a slot is "booked" when either is set. Family may
-- still only self-book via booked_by; the guard blocks them touching guest
-- names. Notifications fire on either field changing.

alter table public.visit_slots add column if not exists booked_name text;

-- guard: non-parents cannot set/clear a guest name
create or replace function public.guard_slot_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_parent() then return new; end if;
  if new.slot_date is distinct from old.slot_date
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.family_id is distinct from old.family_id
     or new.booked_name is distinct from old.booked_name then
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

-- notify on either booked_by or booked_name changing
create or replace function public.notify_on_slot_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_when text;
        booked_now boolean; booked_before boolean;
begin
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
