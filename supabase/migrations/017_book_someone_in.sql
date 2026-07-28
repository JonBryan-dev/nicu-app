-- 017_book_someone_in.sql
-- Parents can book a family member into a slot. Notifications now know the
-- difference: self-bookings tell the parents (as before); booking someone
-- in tells the family (so the booked person hears) AND the other parent.

create or replace function public.notify_on_slot_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_when text;
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
  elsif tg_op = 'UPDATE' and new.booked_by is distinct from old.booked_by then
    if new.booked_by is not null then
      select display_name into v_name from public.profiles where id = new.booked_by;
      if auth.uid() = new.booked_by then
        -- booked themselves: tell the parents
        insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
        values (new.family_id, 'parent', new.booked_by,
                v_name || ' booked a visit', v_when, '/visits');
      else
        -- a parent booked someone in: tell family (incl. them) and the other parent
        insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
        values (new.family_id, 'family', auth.uid(),
                v_name || ' is booked in to visit', v_when, '/visits');
        insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
        values (new.family_id, 'parent', auth.uid(),
                v_name || ' is booked in to visit', v_when, '/visits');
      end if;
    else
      select display_name into v_name from public.profiles where id = old.booked_by;
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
  end if;
  return new;
end $$;
