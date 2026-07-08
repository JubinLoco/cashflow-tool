-- Every table so far has been open to the anon key via the public REST API — fine for
-- local-only dev, but meaningless once the app has a login. Lock all business tables to
-- authenticated users only. The app's API routes use the service_role key (bypasses RLS)
-- for all reads/writes, so this only blocks direct anon-key access, not the app itself.
alter table customer_invoices enable row level security;
alter table supplier_invoices enable row level security;
alter table factoring_rules enable row level security;
alter table factoring_facility_limits enable row level security;
alter table cash_events enable row level security;
alter table payment_delay_stats enable row level security;
alter table sales_forecast enable row level security;
alter table purchase_forecast enable row level security;
alter table settings enable row level security;
alter table supplier_categories enable row level security;

create policy "authenticated read/write" on customer_invoices for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on supplier_invoices for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on factoring_rules for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on factoring_facility_limits for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on cash_events for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on payment_delay_stats for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on sales_forecast for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on purchase_forecast for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on settings for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on supplier_categories for all to authenticated using (true) with check (true);
