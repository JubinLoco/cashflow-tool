alter table sales_forecast drop constraint if exists sales_forecast_product_line_check;
alter table sales_forecast add constraint sales_forecast_product_line_check
  check (product_line in ('gmax_ci', 'residential', 'consultancy'));

alter table customer_invoices
  add column gross_profit numeric,
  add column has_consultancy_article boolean default false;

create table sales_business_line_overrides (
  fortnox_doc_number text primary key references customer_invoices(fortnox_doc_number),
  business_line text check (business_line in ('residential', 'gmax_ci', 'consultancy')) not null
);

alter table sales_business_line_overrides enable row level security;
create policy "authenticated read/write" on sales_business_line_overrides
  for all to authenticated using (true) with check (true);
