-- Organization-level reusable records
create table if not exists public.church_volunteers (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  default_role_name text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_church_volunteers_church_id on public.church_volunteers(church_id);
create index if not exists idx_church_volunteers_name on public.church_volunteers(church_id, full_name);

create table if not exists public.church_task_templates (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null,
  description text,
  department department not null,
  default_due_offset_days int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_church_task_templates_church_id on public.church_task_templates(church_id);
create index if not exists idx_church_task_templates_department on public.church_task_templates(church_id, department);
