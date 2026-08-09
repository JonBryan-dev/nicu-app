-- 025_abuse_controls.sql
-- Launch hardening against strangers, not family:
--  1) NEW families get 8-char invite codes (4.3B combos vs 16.7M). Existing
--     families keep their current codes — nothing changes for them.
--  2) join_family sleeps 1s before rejecting a bad code, throttling brute-force
--     guessing to ~1 try/sec/connection. (A failed-attempt counter table can't
--     work here: raising the exception rolls the log row back too.)
--  3) The storage insert policy now enforces a server-side cap of 400 photos
--     per family — a client can't bypass it with the anon key.

-- 1) longer codes for new families only (defaults; existing rows untouched)
alter table public.families alter column parent_code set default upper(substr(md5(random()::text),1,8));
alter table public.families alter column family_code set default upper(substr(md5(random()::text),1,8));
alter table public.families alter column team_code   set default upper(substr(md5(random()::text),1,8));

-- 2) throttle bad-code guesses
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
  if not found then
    perform pg_sleep(1); -- slow the guesser; the sleep survives the rollback
    raise exception 'invalid invite code';
  end if;
  v_role := case
    when v_family.parent_code = upper(trim(p_code)) then 'parent'
    when v_family.team_code   = upper(trim(p_code)) then 'team'
    else 'family' end;
  insert into public.profiles (id, family_id, display_name, role)
    values (auth.uid(), v_family.id, trim(p_display_name), v_role);
  return json_build_object('family_id', v_family.id, 'role', v_role);
end $$;

-- 3) hard cap: 400 photos/videos per family, enforced at the database
drop policy if exists "update_photos_insert" on storage.objects;
create policy "update_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'update-photos'
    and (storage.foldername(name))[1] = public.my_family_id()::text
    and public.is_parent()
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'update-photos'
        and (storage.foldername(o.name))[1] = public.my_family_id()::text
    ) < 400
  );
