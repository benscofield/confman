create table if not exists public.church_saved_tasks (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  title text not null,
  description text,
  department department not null default 'operations',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_church_saved_tasks_church_id on public.church_saved_tasks(church_id);
create index if not exists idx_church_saved_tasks_title on public.church_saved_tasks(church_id, title);

create table if not exists public.church_task_template_saved_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.church_task_templates(id) on delete cascade,
  saved_task_id uuid not null references public.church_saved_tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (template_id, saved_task_id)
);

create index if not exists idx_church_task_template_saved_tasks_template_id
  on public.church_task_template_saved_tasks(template_id);
create index if not exists idx_church_task_template_saved_tasks_saved_task_id
  on public.church_task_template_saved_tasks(saved_task_id);

-- Backfill existing conference tasks into reusable saved tasks for each church.
insert into public.church_saved_tasks (church_id, title, description, department, is_active)
select distinct c.church_id, t.title, t.description, t.department, true
from public.tasks t
join public.conferences c on c.id = t.conference_id
where not exists (
  select 1
  from public.church_saved_tasks st
  where st.church_id = c.church_id
    and lower(st.title) = lower(t.title)
    and lower(coalesce(st.description, '')) = lower(coalesce(t.description, ''))
);
