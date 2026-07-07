-- Stores the OAuth tokens for the single Fortnox connection (one company).
-- RLS is enabled with no policies: only the service_role key (used server-side
-- in the OAuth callback and sync job, never exposed to the browser) can read/write this.
create table fortnox_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token text not null,
  refresh_token text not null,
  scope text,
  expires_at timestamptz not null,
  updated_at timestamptz default now()
);

alter table fortnox_tokens enable row level security;
