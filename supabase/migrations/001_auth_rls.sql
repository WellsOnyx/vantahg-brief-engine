-- Migration 001: Authentication & Row Level Security
-- Adds user_profiles table and role-based RLS policies
-- Run after enabling Supabase Auth in your project

-- ============================================================================
-- User Profiles table (extends auth.users with role info)
-- ============================================================================

create table if not exists user_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text,
  role text not null default 'reviewer' check (role in ('admin', 'reviewer', 'client')),
  created_at timestamptz default now()
);

alter table user_profiles enable row level security;

-- Auto-create profile on signup via trigger
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'reviewer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Helper function: get current user's role
-- ============================================================================

create or replace function get_user_role()
returns text as $$
  select role from user_profiles where id = auth.uid();
$$ language sql security definer stable;

-- ============================================================================
-- Drop permissive MVP policies
-- ============================================================================

drop policy if exists "Allow all access to cases" on cases;
drop policy if exists "Allow all access to reviewers" on reviewers;
drop policy if exists "Allow all access to clients" on clients;
drop policy if exists "Allow all access to audit_log" on audit_log;

-- ============================================================================
-- Cases: admin/reviewer can read all, clients can read their own
-- ============================================================================

create policy "Admin and reviewer full access to cases"
  on cases for all
  using (get_user_role() in ('admin', 'reviewer'));

create policy "Clients can read their own cases"
  on cases for select
  using (
    get_user_role() = 'client'
    and client_id in (
      select id from clients where contact_email = auth.jwt()->>'email'
    )
  );

-- ============================================================================
-- Reviewers: admin full access, reviewers read own profile
-- ============================================================================

create policy "Admin full access to reviewers"
  on reviewers for all
  using (get_user_role() = 'admin');

create policy "Reviewers can read own profile"
  on reviewers for select
  using (
    get_user_role() = 'reviewer'
    and email = auth.jwt()->>'email'
  );

-- ============================================================================
-- Clients: admin full access, clients read own record
-- ============================================================================

create policy "Admin full access to clients"
  on clients for all
  using (get_user_role() = 'admin');

create policy "Clients can read own record"
  on clients for select
  using (
    get_user_role() = 'client'
    and contact_email = auth.jwt()->>'email'
  );

-- ============================================================================
-- Audit log: admin read-only
-- ============================================================================

create policy "Admin read-only access to audit_log"
  on audit_log for select
  using (get_user_role() = 'admin');

-- Service role (used by API routes) bypasses RLS automatically

-- ============================================================================
-- User profiles: users can read own, admin can read all
-- ============================================================================

create policy "Users can read own profile"
  on user_profiles for select
  using (id = auth.uid());

create policy "Admin can read all profiles"
  on user_profiles for select
  using (get_user_role() = 'admin');

create policy "Admin can update profiles"
  on user_profiles for update
  using (get_user_role() = 'admin');
