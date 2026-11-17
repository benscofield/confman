import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export function createServerSupabaseClient() {
  return createClient(
    env.required("NEXT_PUBLIC_SUPABASE_URL"),
    env.required("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
