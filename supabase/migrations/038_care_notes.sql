-- 038_care_notes.sql
-- Notes for the team: what was in the nappy, the aspirate pH for a feed,
-- whether it went down well, any sick, and anything to tell the nurses or
-- doctors. One row per note, quick fields plus free text; a flagged note
-- stays pinned until someone marks it told. Flagging pushes the other
-- parent so whoever's on next walks in knowing. Parents only.

create table if not exists public.care_notes (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  at           timestamptz not null default now(),
  round_id     uuid references public.care_rounds(id) on delete set null,
  feed_due_at  timestamptz,                              -- the feed slot it relates to
  nappy        text check (nappy is null or nappy in ('wet','dirty','both','dry')),
  ph           numeric(3,1) check (ph is null or ph between 0 and 14),
  went_well    boolean,
  sick         text check (sick is null or sick in ('none','posset','small','large')),
  body         text,
  flag         boolean not null default false,          -- tell the nurse / doctor
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null,
  constraint care_notes_something check (
    nappy is not null or ph is not null or went_well is not null
    or sick is not null or coalesce(body, '') <> ''
  )
);
create index if not exists care_notes_family_at on public.care_notes (family_id, at desc);
create index if not exists care_notes_open_flags on public.care_notes (family_id) where flag and resolved_at is null;

alter table public.care_notes enable row level security;
drop policy if exists cn_parents on public.care_notes;
create policy cn_parents on public.care_notes for all
  using (family_id = public.my_family_id() and public.is_parent())
  with check (family_id = public.my_family_id() and public.is_parent());

-- a flagged note → the other parent hears, with the gist
create or replace function public.notify_on_care_note()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text; v_first text; v_bits text[] := '{}';
begin
  if not new.flag then return new; end if;
  select display_name into v_who from public.profiles where id = new.author_id;
  select split_part(baby_name, ' ', 1) into v_first from public.families where id = new.family_id;
  if new.nappy is not null then v_bits := v_bits || ('nappy ' || new.nappy)::text; end if;
  if new.ph is not null then v_bits := v_bits || ('pH ' || new.ph::text)::text; end if;
  if new.went_well is not null then
    v_bits := v_bits || (case when new.went_well then 'feed went well' else 'feed not great' end)::text;
  end if;
  if new.sick is not null and new.sick <> 'none' then v_bits := v_bits || ('sick: ' || new.sick)::text; end if;
  if coalesce(new.body, '') <> '' then v_bits := v_bits || left(new.body, 120)::text; end if;
  insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
  values (new.family_id, 'parent', new.author_id,
          coalesce(v_who, 'Someone') || ' flagged something for the team',
          coalesce(nullif(array_to_string(v_bits, ' · '), ''), 'about ' || coalesce(v_first, 'her')), '/cares');
  return new;
end $$;
drop trigger if exists trg_notify_care_note on public.care_notes;
create trigger trg_notify_care_note after insert on public.care_notes
  for each row execute function public.notify_on_care_note();

alter publication supabase_realtime add table public.care_notes;
