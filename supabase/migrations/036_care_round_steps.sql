-- 036_care_round_steps.sql
-- Remember how many steps a round had ticked when it was finished, so the
-- Cares tab can score every round ever (full round = all steps) without
-- pulling every care_ticks row back out. Rounds finished before this column
-- existed stay null; the app falls back to counting their ticks.
alter table public.care_rounds
  add column if not exists steps_done int check (steps_done is null or steps_done between 0 and 30);
