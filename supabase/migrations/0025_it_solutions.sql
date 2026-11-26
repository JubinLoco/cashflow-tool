-- IT solutions tab: what the WattWealth + Autotme development invoices cost per month, and
-- how much of that is recovered by invoicing customers for the platform.

-- Which month(s) each IT supplier invoice pays for. The supplier invoice itself (amount in
-- SEK) lives in supplier_invoices; this only maps it to cost months. An invoice covering
-- several months is split evenly across them. New invoices for the two vendors show up on
-- the tab as "unassigned" until a row is added here (done from the tab itself).
create table it_cost_invoices (
  fortnox_doc_number text primary key,   -- = supplier_invoices.fortnox_doc_number
  vendor text not null,                  -- 'WattWealth' | 'Autotme'
  months text[] not null,                -- cost months this invoice covers, "YYYY-MM"
  note text,                             -- team size / remarks, shown on the tab
  created_at timestamptz default now()
);

-- Customer invoice lines for the IT articles (Fortnox article numbers 41 and 105), synced
-- from Fortnox (see src/lib/sync/itRevenue.ts). net_amount is ex VAT.
create table it_revenue_lines (
  fortnox_doc_number text not null,
  article_number text not null,
  customer_name text,
  invoice_date date not null,
  article_description text,
  quantity numeric,
  net_amount numeric not null,
  synced_at timestamptz default now(),
  primary key (fortnox_doc_number, article_number)
);

-- Fixed monthly amounts billed outside the article lines above.
create table it_recurring_revenue (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  customer_name text,
  monthly_amount numeric not null,       -- SEK ex VAT
  start_month text not null,             -- "YYYY-MM", inclusive
  end_month text                         -- null = still running
);

alter table it_cost_invoices enable row level security;
alter table it_revenue_lines enable row level security;
alter table it_recurring_revenue enable row level security;
create policy "authenticated read/write" on it_cost_invoices for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on it_revenue_lines for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on it_recurring_revenue for all to authenticated using (true) with check (true);

insert into it_recurring_revenue (label, customer_name, monthly_amount, start_month)
values ('Monthly IT fee', 'Swedala Tak', 2500, '2026-06');

insert into it_cost_invoices (fortnox_doc_number, vendor, months, note) values
  -- WattWealth (invoices 3883 and 3971 are registered under the supplier name "WattWelath")
  ('3883', 'WattWealth', '{2024-09}', null),
  ('3971', 'WattWealth', '{2024-10,2024-11}', null),
  ('4068', 'WattWealth', '{2024-12,2025-01}', null),
  ('4120', 'WattWealth', '{2025-02,2025-03}', null),
  ('4184', 'WattWealth', '{2025-04,2025-05}', null),
  ('4396', 'WattWealth', '{2025-06,2025-07}', null),
  ('4469', 'WattWealth', '{2025-08}', 'Additional 2 developers + 1 design'),
  ('4582', 'WattWealth', '{2025-09}', 'Additional 2 developers + 1 design'),
  ('4660', 'WattWealth', '{2025-10}', 'Additional 2 developers + 1 design'),
  ('4745', 'WattWealth', '{2025-11}', 'Additional 2 developers + 1 product + 1 design'),
  ('4934', 'WattWealth', '{2025-12}', 'Additional 1 developer + 1 product'),
  ('4956', 'WattWealth', '{2026-01}', 'Additional 1 developer + 1 product'),
  ('5014', 'WattWealth', '{2026-02}', 'Additional 1 developer + 1 product. Half cost due to currency gain'),
  ('5015', 'WattWealth', '{2026-03}', 'Additional 1 developer + 1 product. Half cost due to currency gain'),
  ('5109', 'WattWealth', '{2026-04}', 'Additional 1 developer + 1 product'),
  ('5159', 'WattWealth', '{2026-05}', 'Additional 1 developer + 1 product'),
  ('5272', 'WattWealth', '{2026-06}', 'Additional 1 developer + 1 product + 1 tester'),
  ('5366', 'WattWealth', '{2026-07}', 'Additional 1 developer + 1 product + 1 tester'),
  ('5398', 'WattWealth', '{2026-08}', 'Additional 1 developer + 1 product + 1 tester'),
  ('5523', 'WattWealth', '{2026-09}', 'Additional 1 developer + 1 product + 1 tester'),
  ('5611', 'WattWealth', '{2026-10}', 'Additional 1 developer + 1 product + 1 tester + 1 marketing'),
  -- Autotme (supplier name in Fortnox: "Autotme Platforms Private Limited")
  ('4932', 'Autotme', '{2025-12}', '2 developers + 1 design'),
  ('4933', 'Autotme', '{2026-01}', '2 developers + 1 design'),
  ('5071', 'Autotme', '{2026-02}', '2 developers + 1 design'),
  ('5070', 'Autotme', '{2026-03}', '2 developers + 1 design'),
  ('5139', 'Autotme', '{2026-04}', '2 developers + 1 design'),
  ('5240', 'Autotme', '{2026-05}', '1 developer + 1 design'),
  ('5308', 'Autotme', '{2026-06}', '1 developer + 1 design');
