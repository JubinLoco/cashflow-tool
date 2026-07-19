import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "sales";

// Missing profile row (shouldn't happen once the auto-provision trigger is in place,
// but could for an account created before it existed) falls back to the least-privilege
// role rather than admin.
export async function fetchRole(supabase: SupabaseClient, userId: string): Promise<Role> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return (data?.role as Role) ?? "sales";
}

export async function getCurrentUserRole(): Promise<Role | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return fetchRole(supabase, user.id);
}
