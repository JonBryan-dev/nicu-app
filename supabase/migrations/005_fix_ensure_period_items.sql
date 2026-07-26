-- 005_fix_ensure_period_items.sql
-- Bug fix: ensure_period_items always failed with 42P10 because its
-- ON CONFLICT target could not match the PARTIAL unique index
-- checklist_items_template_period (which has WHERE template_id is not null).
-- The inference clause must repeat the index predicate.

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
  on conflict (family_id, list_type, scope_key, template_id)
    where template_id is not null
    do nothing;
end $$;
