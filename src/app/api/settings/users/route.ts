import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

export async function GET() {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<{ id: string; email: string; role: string }>((from, to) =>
    supabase.from("profiles").select("id, email, role").order("email", { ascending: true }).range(from, to),
  );
  return NextResponse.json(rows);
}

export async function PATCH(request: NextRequest) {
  const { id, role } = (await request.json()) as { id: string; role: string };

  // An admin locking themselves out (no other admin to undo it) is a real footgun here —
  // there's no signup flow, so recovering would mean editing the DB directly.
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (user?.id === id) {
    return NextResponse.json({ error: "You can't change your own role" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
