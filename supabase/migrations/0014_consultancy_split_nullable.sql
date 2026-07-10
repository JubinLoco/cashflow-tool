-- 0013 defaulted the split columns to 0, which is indistinguishable from "computed and
-- genuinely zero" — the sync needs NULL to know a row hasn't been re-classified yet.
alter table customer_invoices
  alter column consultancy_total drop default,
  alter column consultancy_net_total drop default,
  alter column consultancy_gross_profit drop default;

update customer_invoices set
  consultancy_total = null,
  consultancy_net_total = null,
  consultancy_gross_profit = null;
