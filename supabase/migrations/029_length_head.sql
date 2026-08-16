-- 029_length_head.sql
-- Length and head circumference alongside weight on the daily care log, so
-- all three can be plotted on the Fenton / INTERGROWTH-21st preterm charts.
-- Nullable — most days only weight is logged; the unit measures these weekly.
alter table public.care_logs
  add column if not exists length_cm numeric check (length_cm is null or length_cm between 20 and 80),
  add column if not exists head_cm   numeric check (head_cm   is null or head_cm   between 15 and 50);
