import { createClient } from "@supabase/supabase-js";

// Server-only client using the service_role key — bypasses RLS. Never import
// this from a Client Component or anything that ships to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
