import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import type { MarketSize } from "./types";

export type MarketSizeCategory = "solar" | "battery" | "ev_charger";
export type MarketSizeMonthlyRow = { province: string; year: number; month: number; category: MarketSizeCategory; count: number };

const CATEGORY_MAP: Record<string, MarketSizeCategory> = {
  "Installation av solceller": "solar",
  "Installation av lagring": "battery",
  "Installation av laddpunkt": "ev_charger",
};

const UNKNOWN_PROVINCE_VALUES = new Set(["Uppgift saknas", ""]);

const COL_YEAR_MONTH = "År och månad";
const COL_CATEGORY = "Kategorier";
const COL_PROVINCE = "Län";
const COL_COUNT = "Antal, st";
const COL_UTFORARE = "Utförare eller köpare";
const COL_PERIOD = "Betalningsperiod eller godkänd period";

// Non-breaking space (U+00A0), used as a thousands separator in the count column (e.g.
// "1 064" -> 1064). Built via String.fromCharCode rather than a literal/escape in this
// source file, after hitting a real editor/tool round-trip ambiguity with that exact
// character while building the original CLI ingestion script this replaces.
const NBSP_PATTERN = new RegExp(String.fromCharCode(0x00a0), "g");

// Minimal RFC4180-ish CSV line splitter -- handles quoted fields (the header's own
// "Antal, st" column demonstrates this file uses quoting). No embedded newlines inside
// quoted fields observed in a real export, so splitting by line first is safe.
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

export class MarketSizeCsvError extends Error {}

/**
 * Parses a raw Skatteverket "grön teknik" export (comma-separated, UTF-8) into rows.
 * Ported from the standalone scripts/ingest-market-size.mjs CLI tool this replaces --
 * kept here as the single source of truth so both the upload route and any future CLI
 * use share identical parsing logic instead of two copies drifting apart.
 */
export function parseMarketSizeCsv(text: string): MarketSizeMonthlyRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new MarketSizeCsvError("File is empty");
  const header = parseCsvLine(lines[0]);

  const yearMonthIdx = header.indexOf(COL_YEAR_MONTH);
  const categoryIdx = header.indexOf(COL_CATEGORY);
  const lanIdx = header.indexOf(COL_PROVINCE);
  const countIdx = header.indexOf(COL_COUNT);
  const utforareIdx = header.indexOf(COL_UTFORARE);
  const periodIdx = header.indexOf(COL_PERIOD);

  if ([yearMonthIdx, categoryIdx, lanIdx, countIdx].some((i) => i === -1)) {
    throw new MarketSizeCsvError(`Unexpected header shape, expected columns not found: ${JSON.stringify(header)}`);
  }

  const seenUtforareValues = new Set<string>();
  const seenPeriodValues = new Set<string>();
  const rows: MarketSizeMonthlyRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (utforareIdx !== -1) seenUtforareValues.add(fields[utforareIdx]);
    if (periodIdx !== -1) seenPeriodValues.add(fields[periodIdx]);

    const rawCategory = fields[categoryIdx];
    const province = fields[lanIdx];
    const count = Number(fields[countIdx].replace(NBSP_PATTERN, "").replace(/\s/g, ""));

    const category = CATEGORY_MAP[rawCategory];
    if (!category) continue; // unrecognized category row, skip
    if (UNKNOWN_PROVINCE_VALUES.has(province)) continue; // e.g. "Uppgift saknas"

    const match = /^(\d{4})M(\d{2})$/.exec(fields[yearMonthIdx]);
    if (!match) throw new MarketSizeCsvError(`Unexpected year/month value: "${fields[yearMonthIdx]}" on line ${i + 1}`);
    if (Number.isNaN(count)) throw new MarketSizeCsvError(`Unexpected non-numeric count on line ${i + 1}: "${fields[countIdx]}"`);

    rows.push({ province, year: Number(match[1]), month: Number(match[2]), category, count });
  }

  // Tripwire: if either "constant" column ever has more than one distinct value, the
  // per-province-per-month sums this data feeds may be double-counting -- reject the
  // file rather than silently writing bad numbers.
  if (seenUtforareValues.size > 1 || seenPeriodValues.size > 1) {
    throw new MarketSizeCsvError(
      `Expected the "who reported" and "period basis" columns to each have exactly one distinct value (found ${JSON.stringify([...seenUtforareValues])} and ${JSON.stringify([...seenPeriodValues])}) -- this file's structure looks different than expected, may double-count if imported.`,
    );
  }
  if (rows.length === 0) {
    throw new MarketSizeCsvError("No usable rows found in this file after parsing.");
  }

  return rows;
}

/** Replaces the entire market-size table with a freshly-parsed set of rows -- Skatteverket
 * republishes the full history on every export (including revisions to past months), so
 * merging would risk keeping stale figures alongside revised ones. */
export async function replaceMarketSizeMonthly(rows: MarketSizeMonthlyRow[]): Promise<void> {
  const supabase = createAdminClient();

  const { error: deleteError } = await supabase.from("territories_market_size_monthly").delete().not("province", "is", null);
  if (deleteError) throw new Error(deleteError.message);

  // Insert in batches -- thousands of rows in one request risks hitting payload/size limits.
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("territories_market_size_monthly").insert(batch);
    if (error) throw new Error(error.message);
  }
}

function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

export type MarketSizeResult = { monthly: MarketSizeMonthlyRow[]; rollup: MarketSize[]; latestYearMonth: string | null };

/** Reads all monthly rows plus a trailing-12-month rollup (the old market-size.json
 * shape), computed on read rather than stored separately -- one table, no risk of the
 * rollup and monthly detail drifting out of sync. */
export async function readMarketSize(): Promise<MarketSizeResult> {
  const supabase = createAdminClient();
  const monthly = await fetchAllRows<MarketSizeMonthlyRow>((from, to) =>
    supabase.from("territories_market_size_monthly").select("province, year, month, category, count").range(from, to),
  );

  if (monthly.length === 0) {
    return { monthly: [], rollup: [], latestYearMonth: null };
  }

  const latest = monthly.reduce((max, r) => (monthIndex(r.year, r.month) > monthIndex(max.year, max.month) ? r : max));
  const latestIdx = monthIndex(latest.year, latest.month);
  const windowStart = latestIdx - 11;

  const byProvince = new Map<string, { province: string; solar: number; battery: number; evCharger: number }>();
  for (const r of monthly) {
    const idx = monthIndex(r.year, r.month);
    if (idx < windowStart || idx > latestIdx) continue;
    const entry = byProvince.get(r.province) ?? { province: r.province, solar: 0, battery: 0, evCharger: 0 };
    if (r.category === "solar") entry.solar += r.count;
    if (r.category === "battery") entry.battery += r.count;
    if (r.category === "ev_charger") entry.evCharger += r.count;
    byProvince.set(r.province, entry);
  }

  const rollup: MarketSize[] = [...byProvince.values()]
    .map((e) => ({ ...e, total: e.solar + e.battery + e.evCharger }))
    .sort((a, b) => a.province.localeCompare(b.province));

  return { monthly, rollup, latestYearMonth: `${latest.year}-${String(latest.month).padStart(2, "0")}` };
}
