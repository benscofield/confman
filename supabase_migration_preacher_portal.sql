-- Supabase Schema Migration for Preacher Portal
-- This script creates all necessary tables and RLS policies for the preacher self-service portal

-- 1. Add new columns to church_preachers for bio image storage
ALTER TABLE public.church_preachers
ADD COLUMN IF NOT EXISTS bio_image_url text DEFAULT NULL;

-- 2. Create preacher_speaking_slots table
CREATE TABLE IF NOT EXISTS public.preacher_speaking_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  church_preacher_id uuid NOT NULL REFERENCES public.church_preachers(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  altar_call boolean NOT NULL DEFAULT false,
  stage_assignment text DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preacher_speaking_slots_pkey PRIMARY KEY (id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_preacher_speaking_slots_preacher_id 
ON public.preacher_speaking_slots(church_preacher_id);

-- 3. Create preacher_logistics table
CREATE TABLE IF NOT EXISTS public.preacher_logistics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  church_preacher_id uuid NOT NULL UNIQUE REFERENCES public.church_preachers(id) ON DELETE CASCADE,
  hotel_name text DEFAULT NULL,
  room_number text DEFAULT NULL,
  check_in_at timestamp with time zone DEFAULT NULL,
  check_out_at timestamp with time zone DEFAULT NULL,
  dietary_notes text DEFAULT NULL,
  hospitality_notes text DEFAULT NULL,
  flight_number text DEFAULT NULL,
  flight_arrival_at timestamp with time zone DEFAULT NULL,
  flight_departure_at timestamp with time zone DEFAULT NULL,
  pickup_notes text DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preacher_logistics_pkey PRIMARY KEY (id)
);

-- 4. Create preacher_accommodation_requests table
CREATE TABLE IF NOT EXISTS public.preacher_accommodation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  church_preacher_id uuid NOT NULL REFERENCES public.church_preachers(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('dietary', 'mobility', 'family', 'other')),
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
  admin_notes text DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preacher_accommodation_requests_pkey PRIMARY KEY (id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_preacher_accommodation_requests_preacher_id 
ON public.preacher_accommodation_requests(church_preacher_id);

-- 5. Create preacher_flight_documents table
CREATE TABLE IF NOT EXISTS public.preacher_flight_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  church_preacher_id uuid NOT NULL REFERENCES public.church_preachers(id) ON DELETE CASCADE,
  document_url text NOT NULL,
  filename text NOT NULL,
  file_type text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preacher_flight_documents_pkey PRIMARY KEY (id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_preacher_flight_documents_preacher_id 
ON public.preacher_flight_documents(church_preacher_id);

-- 6. Create preacher_pa_assignments table (linking preachers to personal assistants)
CREATE TABLE IF NOT EXISTS public.preacher_pa_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  church_preacher_id uuid NOT NULL UNIQUE REFERENCES public.church_preachers(id) ON DELETE CASCADE,
  church_personal_assistant_id uuid NOT NULL REFERENCES public.church_personal_assistants(id) ON DELETE SET NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preacher_pa_assignments_pkey PRIMARY KEY (id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_preacher_pa_assignments_preacher_id 
ON public.preacher_pa_assignments(church_preacher_id);
CREATE INDEX IF NOT EXISTS idx_preacher_pa_assignments_assistant_id 
ON public.preacher_pa_assignments(church_personal_assistant_id);

-- 7. Enable RLS (Row Level Security) on new tables
ALTER TABLE public.preacher_speaking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preacher_logistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preacher_accommodation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preacher_flight_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preacher_pa_assignments ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for preacher_speaking_slots
-- Preachers can view their own speaking slots
CREATE POLICY "preachers_can_view_own_speaking_slots"
ON public.preacher_speaking_slots
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.church_preachers cp
    WHERE cp.id = preacher_speaking_slots.church_preacher_id
    AND cp.email = auth.jwt() ->> 'email'
  )
);

-- 9. RLS Policies for preacher_logistics
-- Preachers can view their own logistics
CREATE POLICY "preachers_can_view_own_logistics"
ON public.preacher_logistics
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.church_preachers cp
    WHERE cp.id = preacher_logistics.church_preacher_id
    AND cp.email = auth.jwt() ->> 'email'
  )
);

-- 10. RLS Policies for preacher_accommodation_requests
-- Preachers can create accommodation requests for themselves
CREATE POLICY "preachers_can_create_accommodation_requests"
ON public.preacher_accommodation_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.church_preachers cp
    WHERE cp.id = preacher_accommodation_requests.church_preacher_id
    AND cp.email = auth.jwt() ->> 'email'
  )
);

-- Preachers can view their own accommodation requests
CREATE POLICY "preachers_can_view_own_accommodation_requests"
ON public.preacher_accommodation_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.church_preachers cp
    WHERE cp.id = preacher_accommodation_requests.church_preacher_id
    AND cp.email = auth.jwt() ->> 'email'
  )
);

-- 11. RLS Policies for preacher_flight_documents
-- Preachers can insert their own flight documents
CREATE POLICY "preachers_can_upload_flight_documents"
ON public.preacher_flight_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.church_preachers cp
    WHERE cp.id = preacher_flight_documents.church_preacher_id
    AND cp.email = auth.jwt() ->> 'email'
  )
);

-- Preachers can view their own flight documents
CREATE POLICY "preachers_can_view_own_flight_documents"
ON public.preacher_flight_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.church_preachers cp
    WHERE cp.id = preacher_flight_documents.church_preacher_id
    AND cp.email = auth.jwt() ->> 'email'
  )
);

-- 12. RLS Policies for preacher_pa_assignments
-- Preachers can view their assigned PA
CREATE POLICY "preachers_can_view_own_pa_assignment"
ON public.preacher_pa_assignments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.church_preachers cp
    WHERE cp.id = preacher_pa_assignments.church_preacher_id
    AND cp.email = auth.jwt() ->> 'email'
  )
);

-- Create or update Supabase Storage bucket for preacher uploads
-- Run this in the Supabase dashboard SQL editor if bucket creation via SQL is not supported:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('preacher-uploads', 'preacher-uploads', true)
-- ON CONFLICT DO NOTHING;

-- Add storage policies (if using Supabase Storage)
-- Note: These must be set up in the Supabase dashboard under Storage > Policies
-- Policy 1: Allow preachers to upload to their own preacher ID folder
-- Policy 2: Allow public read access to uploaded files

COMMIT;
