-- 016_bulk_slots_rest_private.sql
-- 1) Rest is now parents-only (family sees sit-in needs via Support since
--    the shift->support sync).
-- 2) Bulk-created visiting slots send ONE push, not one per slot: the
--    insert notification dedupes within a 15-second window (rows in the
--    same transaction see each other, so the first slot wins).

drop policy shift_select on public.shift_blocks;
create policy shift_select on public.shift_blocks
  for select using (family_id = public.my_family_id() and public.is_parent());

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
