-- Fortnox's /accounts list response already includes these per account, previously
-- discarded at the sync boundary. balance_brought_forward (opening balance for the current
-- fiscal year) is what lets balance-sheet ratios be computed correctly without a historical
-- voucher backfill: true balance(account, date) = balance_brought_forward + sum of this
-- fiscal year's voucher postings through date. balance_carried_forward (Fortnox's own live
-- running balance) is stored too as a cheap cross-check, not used in ratio math.
alter table fortnox_accounts add column balance_brought_forward numeric;
alter table fortnox_accounts add column balance_carried_forward numeric;
