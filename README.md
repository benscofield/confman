# Conference Management PWA

Production-oriented Next.js App Router scaffold for a Christian conference management platform.

## Tech Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Shadcn-style UI primitives
- Supabase (Postgres, Auth, Storage, Realtime, RLS)
- Twilio (SMS acknowledgment links)
- Stripe (ticketing/bookstore checkout placeholder)
- PWA manifest + service worker offline cache strategy

## Implemented First-Cut Features

- Central task engine schema and service logic
- Task status lifecycle: pending -> assigned -> notified -> acknowledged -> completed -> flagged
- Assignment endpoint: `POST /api/tasks/assign`
- SMS acknowledgment endpoint and page:
  - `GET /api/ack/[token]`
  - `GET /ack/[token]`
- Supabase SQL migration with role and module tables
- RLS policy baseline for admin, preacher, PA, musician, volunteer, bookstore staff
- PWA service worker caching for schedules/tasks paths

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env.local
```

3. Fill in Supabase/Twilio/Stripe credentials in `.env.local`.

4. Run the app:

```bash
npm run dev
```

5. Apply Supabase migration:

- Use Supabase CLI or SQL editor to apply [supabase/migrations/202608140001_init.sql](supabase/migrations/202608140001_init.sql).

## Notes

- Twilio sending is no-op when credentials are missing.
- Stripe routes are functional placeholders; webhook persistence logic is marked TODO.
- The acknowledgment flow uses service-role access in server route handlers by design so volunteers can acknowledge without auth.
- Add icon assets at:
  - `public/icons/icon-192.png`
  - `public/icons/icon-512.png`
