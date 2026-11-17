-- Scope task records to a selected conference
alter table public.tasks
  add column if not exists conference_id uuid references public.conferences(id) on delete cascade;

create index if not exists idx_tasks_conference_id on public.tasks(conference_id);
