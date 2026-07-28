-- 013_meal_windows.sql
-- Protected windows get a kind: 'sleep' (existing) or 'meal' (Mum's lunch /
-- dinner breaks). The pump scheduler plans around both.

alter table public.sleep_windows
  add column if not exists kind text not null default 'sleep'
  check (kind in ('sleep','meal'));
