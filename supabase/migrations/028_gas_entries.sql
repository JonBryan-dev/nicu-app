-- 028_gas_entries.sql
-- "Cotside" blood-gas guide, integrated into the family app. One row per gas
-- sample: numeric values only — printout PHOTOS ARE NEVER STORED (they carry
-- name/DOB/hospital ID; the extract route discards them after reading). No
-- patient identifiers anywhere here. Parents-only, family-scoped, realtime so
-- both parents' phones stay in sync. Capillary O2/sats are deliberately not
-- modelled (heel-prick oxygen numbers are unreliable and must not be shown).

create table if not exists public.gas_entries (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  taken_at      timestamptz not null default now(),
  ph            numeric not null check (ph between 6.5 and 8),
  co2_kpa       numeric not null check (co2_kpa between 1 and 20),
  hco3_std      numeric check (hco3_std between 5 and 50),
  glucose       numeric check (glucose between 0 and 30),
  lactate       numeric check (lactate between 0 and 20),
  fio2_pct      numeric check (fio2_pct between 21 and 100),
  support_mode  text check (support_mode in ('air','lowflow','highflow','cpap','niv','vent')),
  sample_no     text,
  note          text,
  source        text not null default 'manual' check (source in ('manual','photo')),
  created_at    timestamptz not null default now()
);
create index if not exists gas_entries_family_taken
  on public.gas_entries (family_id, taken_at desc);

alter table public.gas_entries enable row level security;
create policy gas_parents on public.gas_entries for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());

alter publication supabase_realtime add table public.gas_entries;
