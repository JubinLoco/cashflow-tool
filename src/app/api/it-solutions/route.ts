import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeItSolutions } from "@/lib/it/monthlyItSolutions";
import { IT_ROLES } from "@/lib/it/config";

export async function GET() {
  try {
    return NextResponse.json(await computeItSolutions());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Maps a supplier invoice to the cost month(s) it pays for (an invoice covering several
// months is split evenly). Used for new invoices from the IT vendors that show up as
// "unassigned" on the tab, and for correcting an existing mapping.
export async function PATCH(request: NextRequest) {
  const { fortnox_doc_number, vendor, months, note, team } = (await request.json()) as {
    fortnox_doc_number: string;
    vendor: string;
    months: string[];
    note?: string | null;
    team?: Record<string, number> | null; // headcount per role, keys from IT_ROLES
  };

  if (!fortnox_doc_number || !["WattWealth", "Autotme"].includes(vendor)) {
    return NextResponse.json({ error: "fortnox_doc_number and a valid vendor are required" }, { status: 400 });
  }
  if (!Array.isArray(months) || months.length === 0 || !months.every((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))) {
    return NextResponse.json({ error: "months must be a non-empty list of YYYY-MM" }, { status: 400 });
  }

  // Keep only known roles with a positive headcount.
  const roleKeys = new Set<string>(IT_ROLES.map((r) => r.key));
  const cleanTeam = team
    ? Object.fromEntries(Object.entries(team).filter(([k, v]) => roleKeys.has(k) && Number.isFinite(Number(v)) && Number(v) > 0).map(([k, v]) => [k, Number(v)]))
    : null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("it_cost_invoices")
    .upsert(
      { fortnox_doc_number, vendor, months, note: note ?? null, ...(cleanTeam ? { team: cleanTeam } : {}) },
      { onConflict: "fortnox_doc_number" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
