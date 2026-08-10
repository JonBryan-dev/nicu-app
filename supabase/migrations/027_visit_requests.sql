-- 027_visit_requests.sql
-- Family members can request a visit time (date + window + optional note).
-- Parents get a push, then approve (which opens a slot and books them in —
-- the existing slot notifications tell everyone) or decline (quiet; the
-- requester sees the status in their Visits tab). Team can't request.

create table if not exists public.visit_requests (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  requested_by  uuid not null references public.profiles(id) on delete cascade,
  req_date      date not null,
  start_time    time not null,
  end_time      time not null,
  note          text,
  status        text not null default 'pending'
                  check (status in ('pending','approved','declined')),
  created_at    timestamptz not null default now(),
  constraint vreq_times check (end_time > start_time)
);
create index if not exists visit_requests_family
  on public.visit_requests (family_id, status, req_date);

alter table public.visit_requests enable row level security;

create policy vreq_select on public.visit_requests
  for select using (family_id = public.my_family_id());
create policy vreq_insert on public.visit_requests
  for insert with check (
    family_id = public.my_family_id()
    and requested_by = auth.uid()
    and public.my_role() in ('parent','family')
  );
create policy vreq_update on public.visit_requests
  for update using (family_id = public.my_family_id() and public.is_parent());
create policy vreq_delete on public.visit_requests
  for delete using (
    family_id = public.my_family_id()
    and (requested_by = auth.uid() or public.is_parent())
  );

-- push the parents when a request comes in. Approvals are announced by the
-- existing slot-booking notifications, so no second notification here.
create or replace function public.notify_on_visit_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_when text;
begin
  v_when := to_char(new.req_date, 'Dy DD Mon') || ' ' ||
            to_char(new.start_time, 'HH24:MI') || '–' || to_char(new.end_time, 'HH24:MI');
  select display_name into v_name from public.profiles where id = new.requested_by;
  insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
  values (new.family_id, 'parent', new.requested_by,
          coalesce(v_name, 'Someone') || ' asked to visit',
          v_when || coalesce(' — “' || new.note || '”', ''), '/visits');
  return new;
end $$;
drop trigger if exists trg_notify_visit_request on public.visit_requests;
create trigger trg_notify_visit_request after insert on public.visit_requests
  for each row execute function public.notify_on_visit_request();

alter publication supabase_realtime add table public.visit_requests;
