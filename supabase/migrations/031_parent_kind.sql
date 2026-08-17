-- 031_parent_kind.sql
-- Which parent this is — mum or dad. Nullable, and purely descriptive: it is
-- NOT a permission. `role` still decides everything that matters. This exists
-- so one parent can have a corner of the app that is theirs — the respiratory
-- evidence library dad reads at the cotside is his reading, not a second
-- family feed.
--
-- Privacy of anything logged behind that corner is enforced by owner-only RLS
-- on the tables in 032 (author_id = auth.uid()), never by this column. A wrong
-- parent_kind can therefore leak nothing; it only changes which tab is offered.
--
-- 019's guard already blocks role and family_id from changing. 020 then let
-- either parent update ANY profile in their family (so they can rename each
-- other) — which would also let one parent flip the other's parent_kind. So
-- the same guard is extended: this column is writable only by the owner of the
-- row, and only on a parent. The 019 rules are preserved verbatim.

alter table public.profiles
  add column if not exists parent_kind text
  check (parent_kind in ('mum','dad'));

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    raise exception 'roles cannot be changed';
  end if;
  if new.family_id is distinct from old.family_id then
    raise exception 'family membership cannot be changed';
  end if;
  if new.parent_kind is distinct from old.parent_kind then
    if new.id is distinct from auth.uid() then
      raise exception 'only you can say whether you are mum or dad';
    end if;
    if new.role <> 'parent' then
      raise exception 'parent_kind only applies to parents';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();
