create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text check (role in ('admin', 'sales')) not null default 'sales',
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- security definer so this can be referenced from a profiles RLS policy
-- without the policy's own subquery recursing into RLS on profiles again.
create function public.is_admin() returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer stable;

create policy "users read own profile" on profiles for select to authenticated using (auth.uid() = id);
create policy "admins read all profiles" on profiles for select to authenticated using (is_admin());
create policy "admins update roles" on profiles for update to authenticated using (is_admin()) with check (is_admin());

-- Auto-provision a profile (default 'sales' — least privilege) whenever a new
-- auth user is created, since there's no in-app signup flow to hook into.
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, role) values (new.id, new.email, 'sales');
  return new;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill existing accounts, then promote the current admin.
insert into public.profiles (id, email, role) select id, email, 'sales' from auth.users on conflict (id) do nothing;
update public.profiles set role = 'admin' where email = 'jubin@dseg.se';
