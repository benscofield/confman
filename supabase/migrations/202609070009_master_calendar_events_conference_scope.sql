alter table public.master_calendar_events
  add column if not exists conference_id uuid references public.conferences(id) on delete cascade;

create index if not exists master_calendar_events_conference_idx
  on public.master_calendar_events(conference_id, starts_at);
