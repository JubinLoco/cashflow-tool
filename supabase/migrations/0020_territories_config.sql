-- Config store for the merged-in "DSEG Territories" feature (settlement tier rules,
-- per-customer overrides/potentials, and prospects). Previously a local JSON file
-- (.gamedata/config.json in the standalone dseg-territories app) -- doesn't survive
-- Vercel's ephemeral filesystem, so it moves to real tables here, same as everything else.
-- `sort_order` avoids quoting "order" (a reserved word) everywhere; the TS layer still
-- calls it `order` (see src/lib/territories/configStore.ts's row<->GameConfig mapping).
create table territories_tier_rules (
  id text primary key,
  label text not null,
  sort_order int not null,
  min_turnover numeric not null,
  max_turnover numeric,
  min_margin_pct numeric,
  max_margin_pct numeric
);

create table territories_overrides (
  customer_number text primary key,
  tier text not null,
  note text default '',
  set_at timestamptz default now()
);

create table territories_potentials (
  customer_number text primary key,
  tier text not null,
  note text default '',
  set_at timestamptz default now()
);

create table territories_prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  province text not null,
  current_competitor_id text,
  potential_tier text not null,
  note text default '',
  created_at timestamptz default now()
);

alter table territories_tier_rules enable row level security;
alter table territories_overrides enable row level security;
alter table territories_potentials enable row level security;
alter table territories_prospects enable row level security;

create policy "authenticated read/write" on territories_tier_rules for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on territories_overrides for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on territories_potentials for all to authenticated using (true) with check (true);
create policy "authenticated read/write" on territories_prospects for all to authenticated using (true) with check (true);

-- Seed with the current live tier rules from dseg-territories/.gamedata/config.json
-- (as of 2026-07-19, after Jubin's own edit adding the "Non-active customers" tier).
-- No overrides/potentials/prospects exist yet in the source file, so nothing else to seed.
insert into territories_tier_rules (id, label, sort_order, min_turnover) values
  ('metropolis', 'Metropolis', 0, 1500000),
  ('city', 'City', 1, 1000000),
  ('town', 'Town', 2, 700000),
  ('mid_village', 'Mid-village', 3, 350000),
  ('village', 'Village', 4, 1000),
  ('tier_1784459475593', 'Non-active customers', 5, 0);
