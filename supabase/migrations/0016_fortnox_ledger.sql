create table fortnox_accounts (
  number text primary key,
  description text,
  active boolean
);

-- One row per voucher line (VoucherRow), not per voucher — a voucher can post to several
-- accounts. row_index (position within VoucherRows) disambiguates a voucher posting the
-- same account twice, which account_number alone can't. amount = Debit - Credit, standard
-- trial-balance sign convention: positive on debit-natured (cost) accounts, negative on
-- credit-natured (revenue) accounts — see src/lib/dashboard/basAccounts.ts for how this
-- gets turned into a signed P&L figure per account class.
create table fortnox_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_series text not null,
  voucher_number integer not null,
  financial_year integer not null,
  row_index integer not null,
  account_number text,
  transaction_date date,
  amount numeric,
  description text,
  unique (voucher_series, voucher_number, financial_year, row_index)
);

alter table fortnox_accounts enable row level security;
create policy "authenticated read/write" on fortnox_accounts
  for all to authenticated using (true) with check (true);

alter table fortnox_vouchers enable row level security;
create policy "authenticated read/write" on fortnox_vouchers
  for all to authenticated using (true) with check (true);
