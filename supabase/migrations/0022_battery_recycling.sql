-- Battery recycling weight tracking (El-Kretsen monthly reporting). Fortnox invoice line
-- items already get fetched at sync time (see src/lib/sync/customerInvoices.ts) but were
-- previously discarded after computing the consultancy split -- this persists the
-- battery-matched ones instead, plus an admin-editable per-model weight so the app can
-- compute total kg sold per month.
alter table customer_invoices add column battery_check_done boolean not null default false;

-- One row per battery-matched Fortnox invoice line item.
create table battery_sale_lines (
  id uuid primary key default gen_random_uuid(),
  fortnox_doc_number text not null references customer_invoices(fortnox_doc_number),
  article_number text not null,
  article_description text,
  quantity numeric not null,
  invoice_date date not null,
  synced_at timestamptz default now(),
  unique (fortnox_doc_number, article_number)
);

-- Admin-editable weight per battery model (one row per distinct Fortnox article number).
-- New article numbers get auto-inserted with weight_kg = null the first time they're seen
-- during sync (see customerInvoices.ts) -- same "flag it, let a human fill in the real
-- value" spirit as supplier_categories for untagged suppliers.
create table battery_models (
  article_number text primary key,
  article_description text,
  weight_kg numeric,
  created_at timestamptz default now()
);

alter table battery_sale_lines enable row level security;
alter table battery_models enable row level security;
create policy "authenticated read/write" on battery_sale_lines for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on battery_models for all to authenticated using (true) with check (true);
