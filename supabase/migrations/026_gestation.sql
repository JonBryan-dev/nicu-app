-- 026_gestation.sql
-- Gestational age at birth (in days, e.g. 25+3 = 178) so weights can be placed
-- on the Fenton preterm chart at the correct postmenstrual age. Nullable —
-- the Fenton view simply stays hidden until a parent sets it. Parents can
-- already update their families row (fam_update policy from 002).
alter table public.families
  add column if not exists gestation_days int
  check (gestation_days between 154 and 300); -- 22+0 .. ~42+6
