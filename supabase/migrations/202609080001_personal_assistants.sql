-- Church-level personal assistant roster with conference-specific assignments
create table if not exists public.church_personal_assistants (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_church_personal_assistants_church_id on public.church_personal_assistants(church_id);
create index if not exists idx_church_personal_assistants_name on public.church_personal_assistants(church_id, full_name);

create table if not exists public.conference_personal_assistants (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  church_personal_assistant_id uuid not null references public.church_personal_assistants(id) on delete cascade,
  role_name text not null default 'Personal Assistant',
  notes text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (conference_id, church_personal_assistant_id)
);

create index if not exists idx_conference_personal_assistants_conference_id on public.conference_personal_assistants(conference_id);
create index if not exists idx_conference_personal_assistants_assistant_id on public.conference_personal_assistants(church_personal_assistant_id);

alter table public.church_personal_assistants enable row level security;
alter table public.conference_personal_assistants enable row level security;

create policy "Church personal assistants read own church or admin" on public.church_personal_assistants
for select using (
  public.is_app_admin() or
  church_id = public.current_app_church_id()
);

create policy "Church personal assistants write admin" on public.church_personal_assistants
for all using (public.is_app_admin())
with check (public.is_app_admin());

create policy "Conference personal assistants read own church or admin" on public.conference_personal_assistants
for select using (
  public.is_app_admin() or
  exists (
    select 1
    from public.conferences c
    where c.id = conference_personal_assistants.conference_id
      and c.church_id = public.current_app_church_id()
  )
);

create policy "Conference personal assistants write admin" on public.conference_personal_assistants
for all using (public.is_app_admin())
with check (public.is_app_admin());

alter publication supabase_realtime add table public.church_personal_assistants;
alter publication supabase_realtime add table public.conference_personal_assistants;
