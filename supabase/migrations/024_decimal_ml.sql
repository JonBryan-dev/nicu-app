-- 024_decimal_ml.sql
-- NICU feeds are often prescribed in half-millilitres (12.5 ml, not 12 or 13),
-- so the feed-amount columns need to hold decimals. double precision (not
-- numeric) so supabase-js returns plain JS numbers and the supply maths keeps
-- working unchanged. Range checks still apply. Left/right pump split stays int.
alter table public.feeds           alter column ml        type double precision;
alter table public.expressing_logs alter column ml        type double precision;
alter table public.feed_settings   alter column baby_ml   type double precision;
alter table public.feed_settings   alter column target_ml type double precision;
alter table public.plan_history    alter column baby_ml   type double precision;
