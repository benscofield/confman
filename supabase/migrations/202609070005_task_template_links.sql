create table if not exists public.task_template_tasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  template_id uuid not null references public.church_task_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, template_id)
);

create index if not exists idx_task_template_tasks_task_id on public.task_template_tasks(task_id);
create index if not exists idx_task_template_tasks_template_id on public.task_template_tasks(template_id);

-- Backfill any previous one-to-one template links to the new many-to-many table.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'church_task_template_id'
  ) then
    insert into public.task_template_tasks (task_id, template_id)
    select t.id, t.church_task_template_id
    from public.tasks t
    where t.church_task_template_id is not null
    on conflict (task_id, template_id) do nothing;
  end if;
end $$;
