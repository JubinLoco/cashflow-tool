create extension if not exists pgcrypto;

-- Raw synced data (mirrors Fortnox)
create table customer_invoices (
  id uuid primary key default gen_random_uuid(),
  fortnox_doc_number text unique not null,
  customer_name text,
  product_line text check (product_line in ('gmax_ci', 'residential')),
  invoice_date date,
  due_date date,
  total numeric,
  balance numeric,              -- 0 = fully paid
  paid_date date,                -- null until settled
  eligible_amount numeric default 0,   -- portion accepted into the factoring facility (recomputed by the FIFO reallocation job)
  excluded_amount numeric default 0,   -- total - eligible_amount; paid directly by the customer, no factoring
  synced_at timestamptz default now()
);

create table supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  fortnox_doc_number text unique not null,
  supplier_name text,
  category text,                 -- rent, salaries, tax, suppliers, factoring_fee, other
  invoice_date date,
  due_date date,
  total numeric,
  balance numeric,
  paid_date date,
  synced_at timestamptz default now()
);

-- Factoring split rules per product line (versioned so % can change over time)
create table factoring_rules (
  id uuid primary key default gen_random_uuid(),
  product_line text check (product_line in ('gmax_ci', 'residential')),
  tranche_a_pct numeric default 0.70,          -- paid by factoring company, D+1
  tranche_a_days_after_invoice int default 1,
  tranche_b_pct numeric default 0.30,          -- paid on customer payment
  tranche_b_fee_pct numeric default 0,         -- unused: factoring co bills its fee separately (~quarterly), not deducted from tranche B
  effective_from date default current_date
);

-- Total revolving credit the factoring company extends (changes only by consultation with them)
create table factoring_facility_limits (
  id uuid primary key default gen_random_uuid(),
  total_eligible_credit numeric not null,      -- e.g. 3,000,000 SEK
  customer_cap_pct numeric default 0.30,       -- max share of the pool any one customer's outstanding factored exposure can hold
  invoice_cap_pct numeric default 0.30,         -- max share of the pool any one invoice's eligible amount can hold
  effective_from date default current_date
);

-- Derived cash events. tranche 'a'/'b' = factored (eligible_amount split), 'c' = excluded amount paid directly by customer
create table cash_events (
  id uuid primary key default gen_random_uuid(),
  source_invoice_id uuid references customer_invoices(id),
  tranche text check (tranche in ('a', 'b', 'c')),
  amount numeric,
  event_date date,                -- actual if known, else estimated
  is_estimated boolean default false,
  created_at timestamptz default now()
);

-- Historical payment-delay pattern (computed periodically from paid invoices)
create table payment_delay_stats (
  id uuid primary key default gen_random_uuid(),
  product_line text,
  avg_days_due_to_paid numeric,
  median_days_due_to_paid numeric,
  sample_size int,
  computed_at timestamptz default now()
);

-- Forecast layer (kept separate from actuals). recurring_group_id groups rows generated
-- together from one "repeating until month X" entry so they can be bulk-edited/deleted.
create table sales_forecast (
  id uuid primary key default gen_random_uuid(),
  description text,
  product_line text check (product_line in ('gmax_ci', 'residential')),
  amount numeric,
  expected_date date,
  probability numeric default 1.0,      -- 0-1
  status text check (status in ('forecast', 'matched', 'dropped')) default 'forecast',
  matched_invoice_id uuid references customer_invoices(id),
  recurring_group_id uuid,
  created_at timestamptz default now()
);

create table purchase_forecast (
  id uuid primary key default gen_random_uuid(),
  description text,
  category text,
  amount numeric,
  expected_date date,
  status text check (status in ('forecast', 'matched', 'dropped')) default 'forecast',
  matched_invoice_id uuid references supplier_invoices(id),
  recurring_group_id uuid,
  created_at timestamptz default now()
);

-- Manual settings (starting balance, danger thresholds, etc.)
create table settings (
  key text primary key,
  value numeric
);

insert into settings (key, value) values
  ('danger_warning_threshold', 500000),
  ('danger_bankruptcy_threshold', 0),
  ('tax_buffer_threshold', 800000);

insert into factoring_facility_limits (total_eligible_credit) values (3000000);
