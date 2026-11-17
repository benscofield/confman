import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export function createBrowserSupabaseClient() {
  if (!env.nextPublicSupabaseUrl || !env.nextPublicSupabaseAnonKey) {
    throw new Error("Supabase public environment variables are not configured.");
  }

  return createClient(env.nextPublicSupabaseUrl, env.nextPublicSupabaseAnonKey);
}
