-- Gross profit and company profit are derived at query time (turnover - cogs,
-- gross_profit - opex), not stored, same convention as derivedForecast.ts.
create table monthly_budget (
  month date primary key,
  turnover numeric not null default 0,
  cogs numeric not null default 0,
  opex numeric not null default 0
);

alter table monthly_budget enable row level security;
create policy "authenticated read/write" on monthly_budget
  for all to authenticated using (true) with check (true);

-- Equity as of the start of the earliest month with ledger data — the roll-forward from
-- there is starting_equity + cumulative real Company Profit per month (see monthlyPnl.ts).
insert into settings (key, value) values ('starting_equity', 0);
