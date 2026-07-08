import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

export async function GET() {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<{ supplier_number: string; supplier_name: string; category: string | null }>(
    (from, to) =>
      supabase
        .from("supplier_categories")
        .select("supplier_number, supplier_name, category")
        .order("supplier_name", { ascending: true })
        .range(from, to),
  );
  return NextResponse.json(rows);
}

export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();
  const { supplier_number, category } = (await request.json()) as { supplier_number: string; category: string };

  const { error } = await supabase.from("supplier_categories").update({ category }).eq("supplier_number", supplier_number);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
