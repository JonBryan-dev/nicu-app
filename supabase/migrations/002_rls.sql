-- 002_rls.sql — row level security
-- Helper functions (security definer so they can read profiles regardless of RLS)

create or replace function public.my_family_id()
returns uuid language sql stable security definer set search_path = public as
$$ select family_id from public.profiles where id = auth.uid() $$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_parent()
returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role from public.profiles where id = auth.uid()) = 'parent', false) $$;

-- ---------- enable RLS everywhere ----------
alter table public.families            enable row level security;
alter table public.profiles            enable row level security;
alter table public.updates             enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_items     enable row level security;
alter table public.support_tasks       enable row level security;
alter table public.visit_slots         enable row level security;
alter table public.shift_blocks        enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.notifications       enable row level security;

-- ---------- families ----------
create policy fam_select on public.families
  for select using (id = public.my_family_id());
create policy fam_update on public.families
  for update using (id = public.my_family_id() and public.is_parent());
-- insert happens only via create_family() RPC (security definer)

-- ---------- profiles ----------
create policy prof_select on public.profiles
  for select using (family_id = public.my_family_id());
create policy prof_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- insert happens only via create_family()/join_family() RPCs

-- ---------- updates ----------
create policy upd_select on public.updates
  for select using (family_id = public.my_family_id());
create policy upd_insert on public.updates
  for insert with check (family_id = public.my_family_id()
                         and author_id = auth.uid()
                         and public.is_parent());
create policy upd_delete on public.updates
  for delete using (family_id = public.my_family_id() and public.is_parent());

-- ---------- checklist templates (parents only manage) ----------
create policy tpl_select on public.checklist_templates
  for select using (family_id = public.my_family_id());
create policy tpl_write on public.checklist_templates
  for all using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());

-- ---------- checklist items (family may read; parents write) ----------
create policy itm_select on public.checklist_items
  for select using (family_id = public.my_family_id());
create policy itm_insert on public.checklist_items
  for insert with check (family_id = public.my_family_id() and public.is_parent());
create policy itm_update on public.checklist_items
  for update using (family_id = public.my_family_id() and public.is_parent());
create policy itm_delete on public.checklist_items
  for delete using (family_id = public.my_family_id() and public.is_parent());

-- ---------- support tasks ----------
create policy sup_select on public.support_tasks
  for select using (family_id = public.my_family_id());
create policy sup_insert on public.support_tasks
  for insert with check (family_id = public.my_family_id() and public.is_parent());
create policy sup_delete on public.support_tasks
  for delete using (family_id = public.my_family_id() and public.is_parent());
-- updates allowed to whole family; trigger guard_support_update() (003) restricts
-- family members to claiming/unclaiming only.
create policy sup_update on public.support_tasks
  for update using (family_id = public.my_family_id());

-- ---------- visit slots ----------
create policy slot_select on public.visit_slots
  for select using (family_id = public.my_family_id());
create policy slot_insert on public.visit_slots
  for insert with check (family_id = public.my_family_id() and public.is_parent());
create policy slot_delete on public.visit_slots
  for delete using (family_id = public.my_family_id() and public.is_parent());
-- updates allowed to whole family; trigger guard_slot_update() (003) restricts
-- family members to booking/cancelling their own slot only.
create policy slot_update on public.visit_slots
  for update using (family_id = public.my_family_id());

-- ---------- shift blocks ----------
create policy shift_select on public.shift_blocks
  for select using (family_id = public.my_family_id());
create policy shift_write on public.shift_blocks
  for all using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());

-- ---------- push subscriptions (own rows only) ----------
create policy push_all on public.push_subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- notifications (read own family; insert same family) ----------
create policy notif_select on public.notifications
  for select using (family_id = public.my_family_id());
create policy notif_insert on public.notifications
  for insert with check (family_id = public.my_family_id());
