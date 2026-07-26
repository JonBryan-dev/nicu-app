-- 001_schema.sql — NICU Companion core schema
create extension if not exists pgcrypto;

-- ---------- families ----------
create table public.families (
  id            uuid primary key default gen_random_uuid(),
  baby_name     text not null,
  baby_dob      date not null,
  parent_code   text not null unique default upper(substr(md5(random()::text),1,6)),
  family_code   text not null unique default upper(substr(md5(random()::text),1,6)),
  created_at    timestamptz not null default now()
);

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  family_id     uuid not null references public.families(id) on delete cascade,
  display_name  text not null,
  role          text not null check (role in ('parent','family')),
  created_at    timestamptz not null default now()
);
create index on public.profiles (family_id);

-- ---------- updates feed ----------
create table public.updates (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  body          text not null check (length(body) between 1 and 4000),
  is_milestone  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on public.updates (family_id, created_at desc);

-- ---------- checklist templates & items ----------
-- list_type: daily | weekly | wellbeing_mum | wellbeing_dad | respite
create table public.checklist_templates (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  list_type     text not null check (list_type in ('daily','weekly','wellbeing_mum','wellbeing_dad','respite')),
  item_text     text not null,
  sort_order    int  not null default 0
);
create index on public.checklist_templates (family_id, list_type, sort_order);

create table public.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  list_type     text not null check (list_type in ('daily','weekly','wellbeing_mum','wellbeing_dad','respite')),
  scope_key     text not null,          -- 'YYYY-MM-DD' or ISO week 'IYYY-Www'
  template_id   uuid references public.checklist_templates(id) on delete cascade,
  item_text     text not null,
  done          boolean not null default false,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);
-- one row per template per period; custom items have null template_id
create unique index checklist_items_template_period
  on public.checklist_items (family_id, list_type, scope_key, template_id)
  where template_id is not null;
create index on public.checklist_items (family_id, list_type, scope_key, sort_order);

-- ---------- support tasks ----------
create table public.support_tasks (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  task_text     text not null check (length(task_text) between 1 and 500),
  claimed_by    uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.support_tasks (family_id, created_at);

-- ---------- visit slots ----------
create table public.visit_slots (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  slot_date     date not null,
  start_time    time not null,
  end_time      time not null check (end_time > start_time),
  booked_by     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.visit_slots (family_id, slot_date, start_time);

-- ---------- shift pattern ----------
create table public.shift_blocks (
  family_id     uuid not null references public.families(id) on delete cascade,
  week_key      text not null,          -- ISO week 'IYYY-Www'
  day_name      text not null check (day_name in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  block_name    text not null check (block_name in ('AM','PM','Eve')),
  assignee      text not null default 'both'
                  check (assignee in ('both','mum','dad','family','rest')),
  updated_at    timestamptz not null default now(),
  primary key (family_id, week_key, day_name, block_name)
);

-- ---------- web push subscriptions ----------
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz not null default now()
);
create index on public.push_subscriptions (profile_id);

-- ---------- notification outbox ----------
-- Insert here; a DB webhook on INSERT calls the notify edge function.
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  recipient_role  text not null check (recipient_role in ('parent','family','all')),
  actor_id        uuid references public.profiles(id) on delete set null, -- excluded from delivery
  title           text not null,
  body            text not null,
  url             text not null default '/',
  created_at      timestamptz not null default now()
);
create index on public.notifications (family_id, created_at desc);

-- ---------- realtime ----------
alter publication supabase_realtime add table
  public.updates, public.support_tasks, public.visit_slots,
  public.checklist_items, public.shift_blocks;
