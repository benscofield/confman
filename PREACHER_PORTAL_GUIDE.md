# Preacher Portal Implementation Guide

## Overview

This document describes the new preacher self-service portal implementation for the Conference Management PWA. Preachers can now sign in, view their conference schedule with highlighted speaking slots, request special accommodations, see their assigned personal assistant, and upload their bio and flight information.

## What's New

### Frontend Components

#### 1. **Preacher Profile Page** (`src/app/preacher-profile/page.tsx`)
- Mobile-friendly design with tabbed interface
- **Schedule Tab**: View conference speaking slots with times, service names, and altar call indicators
- **Accommodations Tab**: Submit special accommodation requests (dietary, mobility, family, other) with priority levels
- **Logistics Tab**: 
  - View hotel details, room number, check-in/check-out dates
  - View flight information
  - Upload flight documents (PDF, JPG, PNG)
  - View assigned personal assistant contact info
- **Profile Tab**:
  - View biography
  - Upload bio image/headshot (JPG, PNG)

**Key Features:**
- Responsive tabs for mobile and desktop
- File upload with validation (max 10MB, specific file types)
- Success/error notifications
- Bearer token authentication
- Graceful loading and error states

### Backend APIs

#### 1. **GET `/api/preacher-profile`**
Fetches complete preacher profile data including:
- Basic info (name, email, phone, ministry)
- Biography
- Speaking slots for the conference
- Logistics (hotel, flight, dietary info, PA contact)
- Personal assistant assignment

**Response Structure:**
```typescript
{
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  ministry_name: string | null;
  biography: string | null;
  speakingSlots: Array<{
    id: string;
    service_name: string;
    starts_at: string;
    ends_at: string;
    altar_call: boolean;
    stage_assignment: string | null;
  }>;
  logistics: {
    hotel_name: string | null;
    room_number: string | null;
    check_in_at: string | null;
    check_out_at: string | null;
    dietary_notes: string | null;
    hospitality_notes: string | null;
    flight_number: string | null;
    flight_arrival_at: string | null;
    flight_departure_at: string | null;
    pickup_notes: string | null;
  } | null;
  personalAssistant: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
  } | null;
}
```

#### 2. **POST `/api/preacher-profile/accommodations`**
Submits an accommodation request

**Request Body:**
```json
{
  "title": "Wheelchair accessibility needed",
  "description": "I require wheelchair accessible room and parking",
  "category": "mobility",
  "priority": "high"
}
```

**Response:** `{ ok: true }`

#### 3. **POST `/api/preacher-profile/bio-upload`**
Uploads a bio image/headshot

**Request:** Multipart form data with file
- Accepted types: JPG, PNG
- Max size: 10MB
- Stored path: `preacher-uploads/bios/`

**Response:** `{ ok: true, url: string }`

#### 4. **POST `/api/preacher-profile/flight-upload`**
Uploads flight documents

**Request:** Multipart form data with file
- Accepted types: JPG, PNG, PDF
- Max size: 10MB
- Stored path: `preacher-uploads/flights/`

**Response:** `{ ok: true, url: string }`

## Database Schema

### New Tables

#### `preacher_speaking_slots`
```sql
CREATE TABLE public.preacher_speaking_slots (
  id uuid PRIMARY KEY,
  church_preacher_id uuid NOT NULL,
  service_name text NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  altar_call boolean DEFAULT false,
  stage_assignment text,
  created_at timestamp with time zone DEFAULT now()
);
```

#### `preacher_logistics`
```sql
CREATE TABLE public.preacher_logistics (
  id uuid PRIMARY KEY,
  church_preacher_id uuid NOT NULL UNIQUE,
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
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
```

#### `preacher_accommodation_requests`
```sql
CREATE TABLE public.preacher_accommodation_requests (
  id uuid PRIMARY KEY,
  church_preacher_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  priority text DEFAULT 'medium',
  status text DEFAULT 'pending',
  admin_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
```

#### `preacher_flight_documents`
```sql
CREATE TABLE public.preacher_flight_documents (
  id uuid PRIMARY KEY,
  church_preacher_id uuid NOT NULL,
  document_url text NOT NULL,
  filename text NOT NULL,
  file_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
```

#### `preacher_pa_assignments`
```sql
CREATE TABLE public.preacher_pa_assignments (
  id uuid PRIMARY KEY,
  church_preacher_id uuid NOT NULL UNIQUE,
  church_personal_assistant_id uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now()
);
```

### Modified Tables

#### `church_preachers`
- Added: `bio_image_url text` — URL to uploaded bio image

## RLS Policies

All new tables have Row Level Security (RLS) enabled with the following policies:

1. **Preachers can view their own data** (SELECT)
   - Speaking slots, logistics, accommodation requests, flight documents, PA assignments

2. **Preachers can create accommodation requests** (INSERT)
   - Only for their own record

3. **Preachers can upload flight documents** (INSERT)
   - Only for their own record

Policies authenticate via the email claim in the JWT token matching the `church_preachers.email` column.

## Supabase Setup Instructions

### 1. Apply the Migration

Run the SQL migration script in Supabase SQL Editor:

```bash
# Option A: Via Supabase Dashboard
1. Go to SQL Editor
2. Click "New Query"
3. Copy and paste the contents of `supabase_migration_preacher_portal.sql`
4. Click "Run"
```

Or use Supabase CLI:

```bash
supabase migration add preacher_portal --local
# Then paste the migration contents and run:
supabase db push
```

### 2. Create Storage Bucket (if not done via SQL)

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('preacher-uploads', 'preacher-uploads', true)
ON CONFLICT (id) DO NOTHING;
```

### 3. Set Up Storage Policies

In Supabase Dashboard, go to **Storage > Policies** for the `preacher-uploads` bucket:

**Policy 1: Allow authenticated users to upload to their folder**
```sql
(bucket_id = 'preacher-uploads') 
AND (auth.role() = 'authenticated')
```

**Policy 2: Allow public read access**
```sql
(bucket_id = 'preacher-uploads')
```

### 4. Populate Test Data (Optional)

```sql
-- Add a speaking slot for a preacher
INSERT INTO preacher_speaking_slots (church_preacher_id, service_name, starts_at, ends_at, altar_call, stage_assignment)
SELECT id, 'Sunday Morning Keynote', NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 1 hour', true, 'Main Stage'
FROM church_preachers
LIMIT 1;

-- Add logistics
INSERT INTO preacher_logistics (church_preacher_id, hotel_name, room_number, check_in_at, flight_number, flight_arrival_at)
SELECT id, 'Hilton Downtown', '412', NOW() + INTERVAL '2 days', 'UA123', NOW() + INTERVAL '2 days 2 hours'
FROM church_preachers
LIMIT 1;

-- Assign a personal assistant
INSERT INTO preacher_pa_assignments (church_preacher_id, church_personal_assistant_id)
SELECT cp.id, cpa.id
FROM church_preachers cp, church_personal_assistants cpa
LIMIT 1;
```

## Authentication Flow

1. Preacher logs in at `/login` with their church email and password (Supabase Auth)
2. Session redirects to `/conferences` (standard flow)
3. Preacher can now access `/preacher-profile` 
4. Backend verifies JWT token and matches email to `church_preachers.email`

**Note:** To enable preacher login, modify the login page to allow preachers to authenticate directly. Current implementation is admin-only.

## File Upload Security

- **Max file size:** 10MB
- **Allowed types for bio:** JPG, PNG
- **Allowed types for flight:** JPG, PNG, PDF
- **Storage path:** `preacher-uploads/{bios|flights}/preacher-{preacherId}-{timestamp}.{ext}`
- **Access:** Public read (via Supabase Storage public URL)
- **Rate limiting:** None (consider adding at production scale)

## Missing Features for Production

1. **Role-based login:** Currently no distinction between admin and preacher roles at login
2. **Email verification:** Preachers should receive login credentials via email
3. **Accommodation request dashboard:** Admins need UI to view and approve requests
4. **Flight tracking:** Could integrate with airline APIs for real-time status
5. **Notifications:** Preachers should be notified when accommodations are approved/declined
6. **Admin preacher management:** UI to assign speaking slots, logistics, and PAs
7. **Two-factor authentication:** For additional security

## Navigation Integration

Add to app shell navigation:

```tsx
{
  href: "/preacher-profile",
  label: "My Schedule",
  matchPrefix: true,
  // Only show for preachers (requires role system)
}
```

Or create a separate preacher sidebar navigation in `/preacher-profile/page.tsx`.

## Testing Checklist

- [ ] Preacher can log in with email/password
- [ ] Profile page loads all data correctly
- [ ] Speaking slots display with correct times and highlights
- [ ] Can submit accommodation request
- [ ] Can upload bio image
- [ ] Can upload flight document
- [ ] Personal assistant info displays
- [ ] All forms show success/error messages
- [ ] Mobile layout is responsive
- [ ] File uploads reject oversized files
- [ ] File uploads reject invalid file types
- [ ] Preacher can only see their own data (RLS verification)

## Deployment Checklist

- [ ] Run Supabase migration
- [ ] Set up Storage bucket and policies
- [ ] Update environment variables (if needed)
- [ ] Add `/preacher-profile` to navigation
- [ ] Populate speaking slots and logistics for test preachers
- [ ] Test with real preacher login
- [ ] Configure email service for preacher notifications (future)

## API Response Examples

### GET /api/preacher-profile

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "full_name": "John Smith",
  "email": "john@example.com",
  "phone": "(555) 123-4567",
  "ministry_name": "Grace Church",
  "biography": "Pastor John has been serving in ministry for 20 years...",
  "speakingSlots": [
    {
      "id": "slot-001",
      "service_name": "Sunday Morning Keynote",
      "starts_at": "2026-11-15T09:00:00Z",
      "ends_at": "2026-11-15T10:00:00Z",
      "altar_call": true,
      "stage_assignment": "Main Stage"
    }
  ],
  "logistics": {
    "hotel_name": "Hilton Downtown",
    "room_number": "412",
    "check_in_at": "2026-11-14T15:00:00Z",
    "check_out_at": "2026-11-17T11:00:00Z",
    "dietary_notes": "Vegetarian",
    "hospitality_notes": "Wife attending, needs extra coffee",
    "flight_number": "UA123",
    "flight_arrival_at": "2026-11-14T14:30:00Z",
    "flight_departure_at": "2026-11-17T18:00:00Z",
    "pickup_notes": "Will arrange own transportation"
  },
  "personalAssistant": {
    "id": "pa-001",
    "full_name": "Sarah Johnson",
    "email": "sarah@example.com",
    "phone": "(555) 987-6543",
    "notes": "Sarah handles all logistics and scheduling"
  }
}
```

---

**Version:** 1.0  
**Last Updated:** 2026-11-07  
**Status:** Ready for Implementation
