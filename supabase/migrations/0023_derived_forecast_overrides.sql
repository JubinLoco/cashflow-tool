-- Tax and material-cost forecasts are computed live from sales_forecast (see
-- derivedForecast.ts), never stored as rows — this lets a specific derived flow be
-- overridden with a known actual value as the real date approaches. `key` is a stable
-- synthetic id per flow ("tax:YYYY-MM" or "material:<sales_forecast id>:foxess"/"other");
-- absence of a row means "still using the formula."
create table derived_forecast_overrides (
  key text primary key,
  amount numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table derived_forecast_overrides enable row level security;
create policy "authenticated read/write" on derived_forecast_overrides for all to authenticated using (true) with check (true);
