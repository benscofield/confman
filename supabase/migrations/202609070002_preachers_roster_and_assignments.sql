-- Church-level preacher roster with conference-specific assignments
create table if not exists public.church_preachers (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  ministry_name text,
  biography text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_church_preachers_church_id on public.church_preachers(church_id);
create index if not exists idx_church_preachers_name on public.church_preachers(church_id, full_name);

create table if not exists public.conference_preachers (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  church_preacher_id uuid not null references public.church_preachers(id) on delete cascade,
  role_name text not null default 'guest_preacher',
  notes text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (conference_id, church_preacher_id)
);

create index if not exists idx_conference_preachers_conference_id on public.conference_preachers(conference_id);
create index if not exists idx_conference_preachers_church_preacher_id on public.conference_preachers(church_preacher_id);
