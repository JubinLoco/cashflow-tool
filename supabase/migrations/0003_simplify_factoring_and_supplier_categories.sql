-- product_line only matters for forecasting, not for real Fortnox invoices or the
-- factoring terms (confirmed: one global 70/30 split / 3M pool applies to every invoice).
alter table customer_invoices drop column product_line;
alter table factoring_rules drop column product_line;

insert into factoring_rules (tranche_a_pct, tranche_a_days_after_invoice, tranche_b_pct, tranche_b_fee_pct)
values (0.70, 1, 0.30, 0);

-- Supplier invoice category isn't derivable from Fortnox fields; maintained manually per supplier.
-- The sync job inserts a row with category = null for any supplier it hasn't seen before,
-- so untagged suppliers are easy to find rather than silently defaulting to something wrong.
create table supplier_categories (
  supplier_number text primary key,
  supplier_name text,
  category text
);
