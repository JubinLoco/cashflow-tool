import { fortnoxPaginate, fortnoxGetDetails } from "@/lib/fortnox/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

type FortnoxAccount = {
  Number: number;
  Description: string;
  Active: boolean;
};

export async function syncFortnoxAccounts() {
  const supabase = createAdminClient();
  let synced = 0;

  for await (const batch of fortnoxPaginate<"Accounts", FortnoxAccount>("/accounts", "Accounts")) {
    if (batch.length === 0) continue;
    const rows = batch.map((a) => ({
      number: String(a.Number),
      description: a.Description,
      active: a.Active,
    }));
    const { error } = await supabase.from("fortnox_accounts").upsert(rows, { onConflict: "number" });
    if (error) throw new Error(`Failed to upsert Fortnox accounts: ${error.message}`);
    synced += rows.length;
  }

  return { synced };
}

type FortnoxVoucherListItem = {
  VoucherSeries: string;
  VoucherNumber: number;
  Year: number;
  TransactionDate: string;
};

// Only the per-voucher detail endpoint exposes VoucherRows — the list endpoint used by
// fortnoxPaginate above is header-only, same pattern as invoices.
type FortnoxVoucherRow = { Account: number; Debit: number; Credit: number; Description: string; Removed: boolean };
type FortnoxVoucherDetail = { VoucherRows: FortnoxVoucherRow[] };

function voucherKey(series: string, number: number, year: number): string {
  return `${series}|${number}|${year}`;
}

// Vouchers are immutable ledger entries (a correction is a new voucher, not an edit to an
// existing one) — unlike invoices, a voucher already synced never needs re-fetching.
export async function syncFortnoxVouchers() {
  const supabase = createAdminClient();
  let synced = 0;

  const existing = await fetchAllRows<{ voucher_series: string; voucher_number: number; financial_year: number }>((from, to) =>
    supabase.from("fortnox_vouchers").select("voucher_series, voucher_number, financial_year").range(from, to),
  );
  const known = new Set(existing.map((r) => voucherKey(r.voucher_series, r.voucher_number, r.financial_year)));

  for await (const batch of fortnoxPaginate<"Vouchers", FortnoxVoucherListItem>("/vouchers", "Vouchers")) {
    const needsDetail = batch.filter((v) => !known.has(voucherKey(v.VoucherSeries, v.VoucherNumber, v.Year)));
    if (needsDetail.length === 0) continue;

    const details = await fortnoxGetDetails<"Voucher", FortnoxVoucherDetail>(
      needsDetail.map((v) => `/vouchers/${v.VoucherSeries}/${v.VoucherNumber}?financialyear=${v.Year}`),
      "Voucher",
    );

    const rows = needsDetail.flatMap((v, i) => {
      known.add(voucherKey(v.VoucherSeries, v.VoucherNumber, v.Year));
      return details[i].VoucherRows.filter((row) => !row.Removed).map((row, rowIndex) => ({
        voucher_series: v.VoucherSeries,
        voucher_number: v.VoucherNumber,
        financial_year: v.Year,
        row_index: rowIndex,
        account_number: String(row.Account),
        transaction_date: v.TransactionDate,
        // Standard trial-balance sign: positive on debit-natured (cost) accounts,
        // negative on credit-natured (revenue) accounts. See basAccounts.ts.
        amount: row.Debit - row.Credit,
        description: row.Description,
      }));
    });
    if (rows.length === 0) continue;

    const { error } = await supabase
      .from("fortnox_vouchers")
      .upsert(rows, { onConflict: "voucher_series,voucher_number,financial_year,row_index" });
    if (error) throw new Error(`Failed to upsert Fortnox vouchers: ${error.message}`);
    synced += rows.length;
  }

  return { synced };
}
