alter table public.tasks
  add column if not exists assigned_conference_volunteer_id uuid references public.conference_volunteers(id) on delete set null;

create index if not exists idx_tasks_assigned_conference_volunteer_id
  on public.tasks(assigned_conference_volunteer_id);
