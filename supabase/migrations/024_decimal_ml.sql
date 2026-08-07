-- 024_decimal_ml.sql
-- NICU feeds are often prescribed in half-millilitres (12.5 ml, not 12 or 13),
-- so the feed-amount columns need to hold decimals. double precision (not
-- numeric) so supabase-js returns plain JS numbers and the supply maths keeps
-- working unchanged. Range checks still apply. Left/right pump split stays int.
--
-- Safe to re-run: altering an already-double column to double is a no-op.
-- NOTE: the plan-history table is feed_plan_history (both it and feed_settings
-- carry baby_ml / target_ml, and saving the plan writes to both).
alter table public.feeds             alter column ml        type double precision;
alter table public.expressing_logs   alter column ml        type double precision;
alter table public.feed_settings     alter column baby_ml   type double precision;
alter table public.feed_settings     alter column target_ml type double precision;
alter table public.feed_plan_history alter column baby_ml   type double precision;
alter table public.feed_plan_history alter column target_ml type double precision;
