-- Conference volunteers are separate from app users and do not log in
create table if not exists public.conference_volunteers (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  role_name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conference_volunteers_conference_id on public.conference_volunteers(conference_id);
create index if not exists idx_conference_volunteers_role_name on public.conference_volunteers(role_name);

alter table public.conference_volunteers enable row level security;

create policy "Conference volunteers read admin" on public.conference_volunteers
for select using (public.is_admin());

create policy "Conference volunteers write admin" on public.conference_volunteers
for all using (public.is_admin())
with check (public.is_admin());

alter publication supabase_realtime add table public.conference_volunteers;
