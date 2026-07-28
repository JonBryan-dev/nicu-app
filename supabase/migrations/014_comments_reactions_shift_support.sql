-- 014_comments_reactions_shift_support.sql
-- 1) Reactions + comments on updates (every role, incl. the NICU team).
-- 2) Shift blocks set to "family" auto-create a linked support job.

-- ---------- comments ----------
create table if not exists public.update_comments (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  update_id  uuid not null references public.updates(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_by_update on public.update_comments (update_id, created_at);

alter table public.update_comments enable row level security;
create policy cmt_select on public.update_comments
  for select using (family_id = public.my_family_id());
create policy cmt_insert on public.update_comments
  for insert with check (family_id = public.my_family_id() and author_id = auth.uid());
create policy cmt_delete on public.update_comments
  for delete using (
    family_id = public.my_family_id()
    and (public.is_parent() or author_id = auth.uid())
  );

-- ---------- reactions ----------
create table if not exists public.update_reactions (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  update_id  uuid not null references public.updates(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (length(emoji) <= 8),
  created_at timestamptz not null default now(),
  unique (update_id, profile_id, emoji)
);
create index if not exists reactions_by_update on public.update_reactions (update_id);

alter table public.update_reactions enable row level security;
create policy rct_select on public.update_reactions
  for select using (family_id = public.my_family_id());
create policy rct_insert on public.update_reactions
  for insert with check (family_id = public.my_family_id() and profile_id = auth.uid());
create policy rct_delete on public.update_reactions
  for delete using (profile_id = auth.uid());

alter publication supabase_realtime add table
  public.update_comments, public.update_reactions;

-- push when someone comments (actor excluded by the notify function)
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select display_name into v_name from public.profiles where id = new.author_id;
  insert into public.notifications (family_id, recipient_role, actor_id, title, body, url)
  values (new.family_id, 'all', new.author_id,
          coalesce(v_name, 'Someone') || ' commented',
          left(new.body, 140), '/');
  return new;
end $$;
drop trigger if exists trg_notify_comment on public.update_comments;
create trigger trg_notify_comment after insert on public.update_comments
  for each row execute function public.notify_on_comment();

-- ---------- shift → support link ----------
alter table public.support_tasks add column if not exists shift_week  text;
alter table public.support_tasks add column if not exists shift_day   text;
alter table public.support_tasks add column if not exists shift_block text;
create index if not exists support_shift_link
  on public.support_tasks (family_id, shift_week, shift_day, shift_block);
