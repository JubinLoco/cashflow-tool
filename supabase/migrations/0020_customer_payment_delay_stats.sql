-- Per-customer breakdown of the same due-date-to-paid-date delay tracked globally in
-- payment_delay_stats — some customers pay reliably on time, others consistently late, and
-- the global average was masking that. Kept as a separate table (rather than a nullable
-- customer_number on payment_delay_stats) since every existing consumer of the global row
-- relies on "exactly one row, most recent" — mixing per-customer rows in would break that.
create table customer_payment_delay_stats (
  customer_number text primary key,
  avg_days_due_to_paid numeric not null,
  median_days_due_to_paid numeric not null,
  sample_size int not null,
  computed_at timestamptz default now()
);

alter table customer_payment_delay_stats enable row level security;
create policy "authenticated read/write" on customer_payment_delay_stats for all to authenticated using (true) with check (true);
