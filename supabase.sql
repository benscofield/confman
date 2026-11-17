-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  phone text,
  role USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.pa_preacher_bindings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pa_profile_id uuid NOT NULL,
  preacher_profile_id uuid NOT NULL,
  bio_for_preacher text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pa_preacher_bindings_pkey PRIMARY KEY (id),
  CONSTRAINT pa_preacher_bindings_pa_profile_id_fkey FOREIGN KEY (pa_profile_id) REFERENCES public.profiles(id),
  CONSTRAINT pa_preacher_bindings_preacher_profile_id_fkey FOREIGN KEY (preacher_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  department USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::task_status,
  due_at timestamp with time zone,
  created_by uuid NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.task_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT task_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT task_assignments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT task_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.task_ack_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  task_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  used_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT task_ack_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT task_ack_tokens_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT task_ack_tokens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.preacher_logistics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  preacher_profile_id uuid NOT NULL,
  hotel_name text,
  room_number text,
  check_in_at timestamp with time zone,
  check_out_at timestamp with time zone,
  dietary_notes text,
  hospitality_notes text,
  flight_number text,
  flight_arrival_at timestamp with time zone,
  flight_departure_at timestamp with time zone,
  pickup_notes text,
  honorarium_amount numeric,
  reimbursement_amount numeric,
  agreement_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preacher_logistics_pkey PRIMARY KEY (id),
  CONSTRAINT preacher_logistics_preacher_profile_id_fkey FOREIGN KEY (preacher_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.speaking_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  preacher_profile_id uuid NOT NULL,
  service_name text NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  altar_call boolean NOT NULL DEFAULT false,
  stage_assignment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT speaking_slots_pkey PRIMARY KEY (id),
  CONSTRAINT speaking_slots_preacher_profile_id_fkey FOREIGN KEY (preacher_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.worship_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  rehearsal_at timestamp with time zone,
  soundcheck_at timestamp with time zone,
  set_start_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT worship_sets_pkey PRIMARY KEY (id)
);
CREATE TABLE public.songs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  video_url text,
  chord_pdf_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT songs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.worship_set_songs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  worship_set_id uuid NOT NULL,
  song_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  CONSTRAINT worship_set_songs_pkey PRIMARY KEY (id),
  CONSTRAINT worship_set_songs_worship_set_id_fkey FOREIGN KEY (worship_set_id) REFERENCES public.worship_sets(id),
  CONSTRAINT worship_set_songs_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id)
);
CREATE TABLE public.offering_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  zone_name text NOT NULL,
  shift_start_at timestamp with time zone NOT NULL,
  shift_end_at timestamp with time zone NOT NULL,
  secure_delivery_log text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT offering_shifts_pkey PRIMARY KEY (id),
  CONSTRAINT offering_shifts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.books (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  speaker_profile_id uuid,
  sku text NOT NULL UNIQUE,
  title text NOT NULL,
  unit_price_cents integer NOT NULL,
  stock_qty integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT books_pkey PRIMARY KEY (id),
  CONSTRAINT books_speaker_profile_id_fkey FOREIGN KEY (speaker_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.book_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  processed_by uuid,
  total_cents integer NOT NULL,
  stripe_checkout_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT book_orders_pkey PRIMARY KEY (id),
  CONSTRAINT book_orders_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.book_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  book_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price_cents integer NOT NULL,
  CONSTRAINT book_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT book_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.book_orders(id),
  CONSTRAINT book_order_items_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id)
);
CREATE TABLE public.tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  qr_code text NOT NULL,
  stripe_checkout_id text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tickets_pkey PRIMARY KEY (id)
);
CREATE TABLE public.receipt_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL,
  amount numeric NOT NULL,
  purpose text NOT NULL,
  image_path text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT receipt_uploads_pkey PRIMARY KEY (id),
  CONSTRAINT receipt_uploads_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.group_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_profile_id uuid NOT NULL,
  role_group USER-DEFINED,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT group_messages_pkey PRIMARY KEY (id),
  CONSTRAINT group_messages_sender_profile_id_fkey FOREIGN KEY (sender_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.notification_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL CHECK (trigger_type = ANY (ARRAY['time'::text, 'event'::text])),
  trigger_expression text NOT NULL,
  target_role USER-DEFINED,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_rules_pkey PRIMARY KEY (id)
);
CREATE TABLE public.web_push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT web_push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT web_push_subscriptions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.master_calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  worship_lead text,
  introductions_by text,
  offering_team text,
  conference_news_by text,
  preacher_name text,
  closer_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT master_calendar_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.churches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  slug text UNIQUE,
  email text,
  phone text,
  website text,
  logo_url text,
  address_line1 text,
  address_line2 text,
  city text,
  state_region text,
  postal_code text,
  country text NOT NULL DEFAULT 'US'::text,
  timezone text NOT NULL DEFAULT 'UTC'::text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT churches_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  church_id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  role USER-DEFINED NOT NULL DEFAULT 'volunteer'::app_role,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id),
  CONSTRAINT users_church_id_fkey FOREIGN KEY (church_id) REFERENCES public.churches(id)
);
CREATE TABLE public.conferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  created_by_user_id uuid,
  name text NOT NULL,
  slug text UNIQUE,
  theme text,
  description text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'active'::text, 'completed'::text, 'archived'::text])),
  venue_name text,
  location_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state_region text,
  postal_code text,
  country text NOT NULL DEFAULT 'US'::text,
  timezone text NOT NULL DEFAULT 'UTC'::text,
  registration_url text,
  banner_image_url text,
  capacity integer,
  public_notes text,
  internal_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conferences_pkey PRIMARY KEY (id),
  CONSTRAINT conferences_church_id_fkey FOREIGN KEY (church_id) REFERENCES public.churches(id),
  CONSTRAINT conferences_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.conference_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conference_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  notes text,
  assigned_by_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conference_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT conference_assignments_conference_id_fkey FOREIGN KEY (conference_id) REFERENCES public.conferences(id),
  CONSTRAINT conference_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT conference_assignments_assigned_by_user_id_fkey FOREIGN KEY (assigned_by_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.conference_volunteers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conference_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  role_name text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conference_volunteers_pkey PRIMARY KEY (id),
  CONSTRAINT conference_volunteers_conference_id_fkey FOREIGN KEY (conference_id) REFERENCES public.conferences(id)
);