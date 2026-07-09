-- Ratios for deriving tax and material-cost outflows directly from unmatched sales
-- forecast entries, so increasing a sales forecast automatically increases the tax and
-- material cost it implies, without needing separate manually-entered purchase forecast
-- rows to be kept in sync by hand.
insert into settings (key, value) values
  ('tax_pct_of_sales', 0.20),
  ('tax_due_day', 26),
  ('gross_margin_pct', 0.15),
  ('foxess_share_pct', 0.80),
  ('foxess_payment_days', 55),
  ('other_supplier_payment_days', 30);
