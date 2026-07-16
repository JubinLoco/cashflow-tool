-- Optional per-deal expected margin (0-1). When null, the weekly-by-line forecast profit
-- calculation falls back to the global gross_margin_pct setting.
alter table sales_forecast add column expected_margin_pct numeric;
