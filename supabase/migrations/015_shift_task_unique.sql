-- 015_shift_task_unique.sql
-- One support job per family-covered shift block: lets the Rest tab
-- reconcile safely from both parents' phones without duplicating jobs.

create unique index if not exists support_shift_unique
  on public.support_tasks (family_id, shift_week, shift_day, shift_block)
  where shift_week is not null;
