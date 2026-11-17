alter table public.tasks
  add column if not exists church_task_template_id uuid references public.church_task_templates(id) on delete set null;

create index if not exists idx_tasks_church_task_template_id on public.tasks(church_task_template_id);
