#!/usr/bin/env node
// Ingests Skatteverket's "gron teknik" (green-tech tax deduction) statistics export and
// regenerates src/data/territories/market-size-monthly.json (full monthly time series)
// and src/data/territories/market-size.json (trailing-12-month rollup per province, as
// of the latest month present in the file).
//
// Re-run whenever Skatteverket publishes an updated export. This fully REPLACES both
// output files rather than merging -- Skatteverket republishes the whole history each
// time (including revisions to past months), so merging would risk keeping stale figures
// alongside revised ones.
//
// Usage: node scripts/ingest-market-size.mjs <path-to-skatteverket-csv>
//
// Expected input shape (comma-separated, UTF-8 encoded, header verified 2026-07-20
// against a real export): "Gron teknik", "Utforare eller kopare", "Betalningsperiod
// eller godkand period", "Ar och manad", "Kategorier", "Lan", "Antal, st" (Swedish
// accented characters kept only in the CATEGORY_MAP/header-match strings below, not in
// comments, to sidestep an editor/encoding round-trip issue hit while building this).
//
// "Utforare eller kopare" and "Betalningsperiod eller godkand period" have been confirmed
// constant (always "Kopare" / "Betalningsperiod") across a real export -- they're kept as
// a schema-drift tripwire (see the validation below), not used for grouping. If a future
// export ever contains more than one value in either column, this script's category
// counts would silently double things, so it's worth re-checking before trusting a new
// file that fails that check.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "src", "data", "territories");

const CATEGORY_MAP = {
  "Installation av solceller": "solar",
  "Installation av lagring": "battery",
  "Installation av laddpunkt": "ev_charger",
};

const UNKNOWN_PROVINCE_VALUES = new Set(["Uppgift saknas", ""]);

// Header column names, written with unicode escapes (not literal accented characters)
// to avoid any editor/terminal encoding round-trip ambiguity.
const COL_YEAR_MONTH = "År och månad"; // "Ar och manad"
const COL_CATEGORY = "Kategorier";
const COL_PROVINCE = "Län"; // "Lan"
const COL_COUNT = "Antal, st";
const COL_UTFORARE = "Utförare eller köpare"; // "Utforare eller kopare"
const COL_PERIOD = "Betalningsperiod eller godkänd period"; // "...godkand period"

// Non-breaking space (U+00A0) is used as a thousands separator in the count column
// (e.g. "1 064" -> 1064); stripped alongside ordinary whitespace before parsing.
const NBSP = " ";

// Minimal RFC4180-ish CSV line splitter -- handles quoted fields (the header's own
// "Antal, st" column demonstrates this file uses quoting). No embedded newlines inside
// quoted fields observed in a real export, so splitting by line first is safe.
function parseCsvLine(line) {
  const fields = [];
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

function monthIndex(year, month) {
  return year * 12 + month;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/ingest-market-size.mjs <path-to-skatteverket-csv>");
    process.exit(1);
  }

  const buffer = readFileSync(inputPath);
  const text = new TextDecoder("utf-8").decode(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);

  const yearMonthIdx = header.indexOf(COL_YEAR_MONTH);
  const categoryIdx = header.indexOf(COL_CATEGORY);
  const lanIdx = header.indexOf(COL_PROVINCE);
  const countIdx = header.indexOf(COL_COUNT);
  const utforareIdx = header.indexOf(COL_UTFORARE);
  const periodIdx = header.indexOf(COL_PERIOD);

  if ([yearMonthIdx, categoryIdx, lanIdx, countIdx].some((i) => i === -1)) {
    throw new Error(`Unexpected header shape, columns not found: ${JSON.stringify(header)}`);
  }

  const seenUtforareValues = new Set();
  const seenPeriodValues = new Set();
  const rows = [];
  let skippedUnknownProvince = 0;
  let skippedUnknownCategory = 0;

  const nbspPattern = new RegExp(NBSP, "g");

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (utforareIdx !== -1) seenUtforareValues.add(fields[utforareIdx]);
    if (periodIdx !== -1) seenPeriodValues.add(fields[periodIdx]);

    const rawCategory = fields[categoryIdx];
    const province = fields[lanIdx];
    const cleanedCount = fields[countIdx].replace(nbspPattern, "").replace(/\s/g, "");
    const count = Number(cleanedCount);

    const category = CATEGORY_MAP[rawCategory];
    if (!category) {
      skippedUnknownCategory++;
      continue;
    }
    if (UNKNOWN_PROVINCE_VALUES.has(province)) {
      skippedUnknownProvince++;
      continue;
    }

    const match = /^(\d{4})M(\d{2})$/.exec(fields[yearMonthIdx]);
    if (!match) throw new Error(`Unexpected year/month value: "${fields[yearMonthIdx]}" on line ${i + 1}`);
    const year = Number(match[1]);
    const month = Number(match[2]);

    if (Number.isNaN(count)) throw new Error(`Unexpected non-numeric count on line ${i + 1}: "${fields[countIdx]}"`);

    rows.push({ province, year, month, category, count });
  }

  // Tripwire: if either "constant" column ever has more than one distinct value, this
  // script's per-province-per-month sums may be double-counting -- stop rather than
  // silently write bad numbers. See the header comment above.
  if (seenUtforareValues.size > 1 || seenPeriodValues.size > 1) {
    throw new Error(
      `Expected the "who reported" and "period basis" columns to each have exactly one distinct value (found ${JSON.stringify([...seenUtforareValues])} and ${JSON.stringify([...seenPeriodValues])}) -- re-check this file's structure before trusting the output, this script may be double-counting.`,
    );
  }

  rows.sort(
    (a, b) =>
      a.year - b.year ||
      a.month - b.month ||
      a.province.localeCompare(b.province) ||
      a.category.localeCompare(b.category),
  );

  writeFileSync(path.join(OUTPUT_DIR, "market-size-monthly.json"), JSON.stringify(rows, null, 2) + "\n", "utf-8");

  // Trailing-12-month rollup as of the latest (year, month) present in the data.
  const latest = rows.reduce((max, r) => (monthIndex(r.year, r.month) > monthIndex(max.year, max.month) ? r : max), rows[0]);
  const latestIdx = monthIndex(latest.year, latest.month);
  const windowStart = latestIdx - 11;

  const byProvince = new Map();
  for (const r of rows) {
    const idx = monthIndex(r.year, r.month);
    if (idx < windowStart || idx > latestIdx) continue;
    const entry = byProvince.get(r.province) ?? { province: r.province, solar: 0, battery: 0, evCharger: 0 };
    if (r.category === "solar") entry.solar += r.count;
    if (r.category === "battery") entry.battery += r.count;
    if (r.category === "ev_charger") entry.evCharger += r.count;
    byProvince.set(r.province, entry);
  }

  const rollup = [...byProvince.values()]
    .map((e) => ({ ...e, total: e.solar + e.battery + e.evCharger }))
    .sort((a, b) => a.province.localeCompare(b.province));

  writeFileSync(path.join(OUTPUT_DIR, "market-size.json"), JSON.stringify(rollup, null, 2) + "\n", "utf-8");

  console.log(
    `Wrote ${rows.length} monthly rows (${skippedUnknownProvince} unknown-province rows skipped, ${skippedUnknownCategory} unknown-category rows skipped).`,
  );
  console.log(`Trailing-12mo rollup as of ${latest.year}-${String(latest.month).padStart(2, "0")}, across ${rollup.length} provinces.`);
}

main();
