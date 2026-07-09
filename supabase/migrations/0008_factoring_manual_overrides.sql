-- Real per-invoice eligibility data from the factoring company (Swedbank), reported
-- periodically outside any API — e.g. "belåningsbara"/"ej belåningsbara" reports. Our own
-- FIFO pool-cap simulation in reallocateFactoring() can't know these invoice-specific
-- reasons (disputed, bankruptcy, rejected payment terms, etc.), so this table lets a real
-- reported exception override the simulation for a specific invoice.
create table factoring_manual_overrides (
  id uuid primary key default gen_random_uuid(),
  fortnox_doc_number text not null unique,
  reason_code text,
  reason_description text,
  -- exclude_entirely: not confident we'll ever collect it (delayed/bankruptcy/disputed) —
  --   contributes nothing to cash_events or the projection at all.
  -- full_amount_on_payment: still expected, just never factored (e.g. stopped in
  --   collections, now handled via Payex) — 100% lands whenever the customer pays,
  --   same timing as the existing tranche C mechanism.
  treatment text check (treatment in ('exclude_entirely', 'full_amount_on_payment')) not null,
  noted_date date default current_date,
  created_at timestamptz default now()
);

alter table factoring_manual_overrides enable row level security;
create policy "authenticated read/write" on factoring_manual_overrides for all to authenticated using (true) with check (true);
