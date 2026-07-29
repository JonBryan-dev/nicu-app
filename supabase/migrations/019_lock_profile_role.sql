-- 019_lock_profile_role.sql
-- Privilege-escalation fix: prof_update_self allowed users to edit ANY
-- column of their own profile — including role (self-promotion to parent)
-- and family_id (hopping into another family). Roles and family membership
-- are only ever set at join time by the security-definer RPCs; block them
-- from changing on update. Display-name edits remain allowed.

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    raise exception 'roles cannot be changed';
  end if;
  if new.family_id is distinct from old.family_id then
    raise exception 'family membership cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();
