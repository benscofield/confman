-- Extensions
create extension if not exists pgcrypto;

-- Role + task enums
create type app_role as enum ('admin', 'preacher', 'pa', 'musician', 'volunteer', 'bookstore_staff');
create type task_status as enum ('pending', 'assigned', 'notified', 'acknowledged', 'completed', 'flagged');
create type department as enum ('operations', 'preacher_logistics', 'worship', 'volunteer', 'bookstore', 'ticketing');

-- Profiles + role mapping
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role app_role not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pa_preacher_bindings (
  id uuid primary key default gen_random_uuid(),
  pa_profile_id uuid not null references public.profiles(id) on delete cascade,
  preacher_profile_id uuid not null references public.profiles(id) on delete cascade,
  bio_for_preacher text,
  created_at timestamptz not null default now(),
  unique (pa_profile_id, preacher_profile_id)
);

-- Central task engine
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  department department not null,
  status task_status not null default 'pending',
  due_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (task_id, profile_id)
);

create table if not exists public.task_ack_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

-- Preacher logistics
create table if not exists public.preacher_logistics (
  id uuid primary key default gen_random_uuid(),
  preacher_profile_id uuid not null references public.profiles(id) on delete cascade,
  hotel_name text,
  room_number text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  dietary_notes text,
  hospitality_notes text,
  flight_number text,
  flight_arrival_at timestamptz,
  flight_departure_at timestamptz,
  pickup_notes text,
  honorarium_amount numeric(12,2),
  reimbursement_amount numeric(12,2),
  agreement_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.speaking_slots (
  id uuid primary key default gen_random_uuid(),
  preacher_profile_id uuid not null references public.profiles(id) on delete cascade,
  service_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  altar_call boolean not null default false,
  stage_assignment text,
  created_at timestamptz not null default now()
);

-- Worship module
create table if not exists public.worship_sets (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  rehearsal_at timestamptz,
  soundcheck_at timestamptz,
  set_start_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  video_url text,
  chord_pdf_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.worship_set_songs (
  id uuid primary key default gen_random_uuid(),
  worship_set_id uuid not null references public.worship_sets(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  order_index int not null default 0,
  unique (worship_set_id, song_id)
);

-- Volunteer offering module
create table if not exists public.offering_shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  zone_name text not null,
  shift_start_at timestamptz not null,
  shift_end_at timestamptz not null,
  secure_delivery_log text,
  created_at timestamptz not null default now()
);

-- Bookstore and inventory
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  speaker_profile_id uuid references public.profiles(id),
  sku text unique not null,
  title text not null,
  unit_price_cents int not null,
  stock_qty int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_orders (
  id uuid primary key default gen_random_uuid(),
  processed_by uuid references public.profiles(id),
  total_cents int not null,
  stripe_checkout_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.book_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.book_orders(id) on delete cascade,
  book_id uuid not null references public.books(id),
  quantity int not null,
  unit_price_cents int not null
);

-- Ticketing and receipts
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  qr_code text not null,
  stripe_checkout_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_uploads (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id),
  amount numeric(12,2) not null,
  purpose text not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

-- Group messaging + notifications
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id),
  role_group app_role,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('time', 'event')),
  trigger_expression text not null,
  target_role app_role,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Public master calendar
create table if not exists public.master_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  worship_lead text,
  introductions_by text,
  offering_team text,
  conference_news_by text,
  preacher_name text,
  closer_name text,
  created_at timestamptz not null default now()
);

-- Helpers for RLS
create or replace function public.current_user_role()
returns app_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_user_role() = 'admin'::app_role
$$;

create or replace function public.pa_has_preacher(pa_id uuid, preacher_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.pa_preacher_bindings b
    where b.pa_profile_id = pa_id and b.preacher_profile_id = preacher_id
  )
$$;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.pa_preacher_bindings enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_ack_tokens enable row level security;
alter table public.preacher_logistics enable row level security;
alter table public.speaking_slots enable row level security;
alter table public.worship_sets enable row level security;
alter table public.songs enable row level security;
alter table public.worship_set_songs enable row level security;
alter table public.offering_shifts enable row level security;
alter table public.books enable row level security;
alter table public.book_orders enable row level security;
alter table public.book_order_items enable row level security;
alter table public.tickets enable row level security;
alter table public.receipt_uploads enable row level security;
alter table public.group_messages enable row level security;
alter table public.notification_rules enable row level security;
alter table public.web_push_subscriptions enable row level security;
alter table public.master_calendar_events enable row level security;

-- Profiles
create policy "Profiles view own or admin" on public.profiles
for select using (auth.uid() = id or public.is_admin());

create policy "Profiles update own or admin" on public.profiles
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

-- Tasks
create policy "Tasks read by assigned or admin" on public.tasks
for select using (
  public.is_admin() or
  exists (
    select 1 from public.task_assignments ta
    where ta.task_id = tasks.id and ta.profile_id = auth.uid()
  )
);

create policy "Tasks write by admin" on public.tasks
for all using (public.is_admin())
with check (public.is_admin());

-- Task assignments
create policy "Task assignments read own or admin" on public.task_assignments
for select using (public.is_admin() or profile_id = auth.uid());

create policy "Task assignments write admin" on public.task_assignments
for all using (public.is_admin()) with check (public.is_admin());

-- Acknowledgment tokens: admin only in SQL path, anonymous ack via service key route handler
create policy "Task ack tokens admin" on public.task_ack_tokens
for all using (public.is_admin()) with check (public.is_admin());

-- Preacher logistics
create policy "Preacher logistics read" on public.preacher_logistics
for select using (
  public.is_admin() or
  preacher_profile_id = auth.uid() or
  (public.current_user_role() = 'pa' and public.pa_has_preacher(auth.uid(), preacher_profile_id))
);

create policy "Preacher logistics write" on public.preacher_logistics
for all using (
  public.is_admin() or
  (public.current_user_role() = 'pa' and public.pa_has_preacher(auth.uid(), preacher_profile_id))
)
with check (
  public.is_admin() or
  (public.current_user_role() = 'pa' and public.pa_has_preacher(auth.uid(), preacher_profile_id))
);

-- Speaking slots
create policy "Speaking slots read" on public.speaking_slots
for select using (
  public.is_admin() or preacher_profile_id = auth.uid() or
  (public.current_user_role() = 'pa' and public.pa_has_preacher(auth.uid(), preacher_profile_id))
);

create policy "Speaking slots write admin/pa" on public.speaking_slots
for all using (
  public.is_admin() or
  (public.current_user_role() = 'pa' and public.pa_has_preacher(auth.uid(), preacher_profile_id))
)
with check (
  public.is_admin() or
  (public.current_user_role() = 'pa' and public.pa_has_preacher(auth.uid(), preacher_profile_id))
);

-- Worship module
create policy "Worship read for musicians and admin" on public.worship_sets
for select using (public.is_admin() or public.current_user_role() in ('musician', 'preacher', 'pa'));

create policy "Worship write admin" on public.worship_sets
for all using (public.is_admin()) with check (public.is_admin());

create policy "Songs read musicians" on public.songs
for select using (public.is_admin() or public.current_user_role() in ('musician', 'preacher', 'pa'));

create policy "Songs write admin" on public.songs
for all using (public.is_admin()) with check (public.is_admin());

create policy "Worship set songs read" on public.worship_set_songs
for select using (public.is_admin() or public.current_user_role() in ('musician', 'preacher', 'pa'));

create policy "Worship set songs write admin" on public.worship_set_songs
for all using (public.is_admin()) with check (public.is_admin());

-- Offering shifts
create policy "Offering shifts read own or admin" on public.offering_shifts
for select using (public.is_admin() or profile_id = auth.uid());

create policy "Offering shifts write admin" on public.offering_shifts
for all using (public.is_admin()) with check (public.is_admin());

-- Bookstore
create policy "Books read for all authenticated" on public.books
for select using (auth.role() = 'authenticated');

create policy "Books write bookstore staff/admin" on public.books
for all using (public.is_admin() or public.current_user_role() = 'bookstore_staff')
with check (public.is_admin() or public.current_user_role() = 'bookstore_staff');

create policy "Book orders read/write bookstore staff/admin" on public.book_orders
for all using (public.is_admin() or public.current_user_role() = 'bookstore_staff')
with check (public.is_admin() or public.current_user_role() = 'bookstore_staff');

create policy "Book order items read/write bookstore staff/admin" on public.book_order_items
for all using (public.is_admin() or public.current_user_role() = 'bookstore_staff')
with check (public.is_admin() or public.current_user_role() = 'bookstore_staff');

-- Tickets and receipts
create policy "Tickets read admin or owner email placeholder" on public.tickets
for select using (public.is_admin());

create policy "Tickets write admin" on public.tickets
for all using (public.is_admin()) with check (public.is_admin());

create policy "Receipts read own or admin" on public.receipt_uploads
for select using (public.is_admin() or submitted_by = auth.uid());

create policy "Receipts write own or admin" on public.receipt_uploads
for insert with check (public.is_admin() or submitted_by = auth.uid());

create policy "Receipts update admin" on public.receipt_uploads
for update using (public.is_admin()) with check (public.is_admin());

-- Group messages
create policy "Group messages read authenticated" on public.group_messages
for select using (auth.role() = 'authenticated');

create policy "Group messages write authenticated" on public.group_messages
for insert with check (auth.uid() = sender_profile_id);

-- Notification rules
create policy "Notification rules admin" on public.notification_rules
for all using (public.is_admin()) with check (public.is_admin());

create policy "Push subscriptions read own/admin" on public.web_push_subscriptions
for select using (public.is_admin() or profile_id = auth.uid());

create policy "Push subscriptions write own/admin" on public.web_push_subscriptions
for all using (public.is_admin() or profile_id = auth.uid())
with check (public.is_admin() or profile_id = auth.uid());

-- Master calendar is public read
create policy "Master calendar public read" on public.master_calendar_events
for select using (true);

create policy "Master calendar admin write" on public.master_calendar_events
for all using (public.is_admin()) with check (public.is_admin());

-- Realtime for critical operational tables
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_assignments;
alter publication supabase_realtime add table public.preacher_logistics;
alter publication supabase_realtime add table public.books;
