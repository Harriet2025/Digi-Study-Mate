import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { IngestionError } from "@/lib/ingestion/errors";

let client: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service role key (bypasses RLS).
 * Never import this from client components.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new IngestionError(
      "CONFIGURATION_ERROR",
      500,
      "The server is not configured for storage.",
      { cause: new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.") },
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
