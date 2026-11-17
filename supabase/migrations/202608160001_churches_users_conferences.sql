-- Multi-church conference tenant model
create extension if not exists pgcrypto;

-- Churches
create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  slug text unique,
  email text,
  phone text,
  website text,
  logo_url text,
  address_line1 text,
  address_line2 text,
  city text,
  state_region text,
  postal_code text,
  country text not null default 'US',
  timezone text not null default 'UTC',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- App users tied to Auth + a church
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete restrict,
  email text not null unique,
  full_name text not null,
  first_name text,
  last_name text,
  phone text,
  role app_role not null default 'volunteer',
  avatar_url text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_church_id on public.users(church_id);
create index if not exists idx_users_auth_user_id on public.users(auth_user_id);

-- Conferences belong to one church
create table if not exists public.conferences (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  created_by_user_id uuid references public.users(id) on delete set null,
  name text not null,
  slug text unique,
  theme text,
  description text,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'active', 'completed', 'archived')),
  venue_name text,
  location_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state_region text,
  postal_code text,
  country text not null default 'US',
  timezone text not null default 'UTC',
  registration_url text,
  banner_image_url text,
  capacity int,
  public_notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_conferences_church_id on public.conferences(church_id);
create index if not exists idx_conferences_created_by_user_id on public.conferences(created_by_user_id);
create index if not exists idx_conferences_dates on public.conferences(start_date, end_date);

-- Generic conference assignments for preachers, musicians, PA, offering takers, etc.
create table if not exists public.conference_assignments (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_name text not null,
  display_order int not null default 0,
  notes text,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conference_id, user_id, role_name)
);

create index if not exists idx_conference_assignments_conference_id on public.conference_assignments(conference_id);
create index if not exists idx_conference_assignments_user_id on public.conference_assignments(user_id);
create index if not exists idx_conference_assignments_role_name on public.conference_assignments(role_name);

-- Helper functions for RLS
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_app_church_id()
returns uuid
language sql
stable
as $$
  select church_id
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_app_role()
returns app_role
language sql
stable
as $$
  select role
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin'::app_role
$$;

-- RLS
alter table public.churches enable row level security;
alter table public.users enable row level security;
alter table public.conferences enable row level security;
alter table public.conference_assignments enable row level security;

-- Churches
create policy "Churches read own or admin" on public.churches
for select using (public.is_app_admin() or id = public.current_app_church_id());

create policy "Churches write admin" on public.churches
for all using (public.is_app_admin())
with check (public.is_app_admin());

-- Users
create policy "Users read self, church, or admin" on public.users
for select using (
  public.is_app_admin() or
  auth_user_id = auth.uid() or
  church_id = public.current_app_church_id()
);

create policy "Users write admin" on public.users
for all using (public.is_app_admin())
with check (public.is_app_admin());

-- Conferences
create policy "Conferences read own church or admin" on public.conferences
for select using (
  public.is_app_admin() or
  church_id = public.current_app_church_id()
);

create policy "Conferences write admin" on public.conferences
for all using (public.is_app_admin())
with check (public.is_app_admin());

-- Conference assignments
create policy "Conference assignments read own church or admin" on public.conference_assignments
for select using (
  public.is_app_admin() or
  exists (
    select 1
    from public.conferences c
    join public.users u on u.id = conference_assignments.user_id
    where c.id = conference_assignments.conference_id
      and c.church_id = public.current_app_church_id()
  ) or
  user_id = public.current_app_user_id()
);

create policy "Conference assignments write admin" on public.conference_assignments
for all using (public.is_app_admin())
with check (public.is_app_admin());

-- Realtime for the new tenant model
alter publication supabase_realtime add table public.churches;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.conferences;
alter publication supabase_realtime add table public.conference_assignments;
