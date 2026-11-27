-- ============================================================================
-- Mobile PIN Authentication
-- Uses the existing public.users table.
-- The existing users table already contains:
-- id, shop_id, tenant_id, name, email, role, pin_hash, password
-- ============================================================================

create extension if not exists pgcrypto;


-- ============================================================================
-- Verify mobile user login with Email and Password
--
-- The password is authenticated inside PostgreSQL securely.
-- Returns user details on success, empty on wrong credentials.
-- password_hash is NEVER returned to the mobile app.
-- Supports both direct match and pgcrypto crypt() hash.
-- ============================================================================

create or replace function public.login_with_email(
  p_email text,
  p_password text
)
returns table (
  id uuid,
  name text,
  email text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    u.id,
    u.name::text,
    u.email::text,
    u.role::text
  from public.users u
  where lower(u.email) = lower(trim(p_email))
    and u.is_active = true
    and (
      u.password_hash = p_password
      or (u.password_hash is not null and u.password_hash = crypt(p_password, u.password_hash))
    );
end;
$$;


-- ============================================================================
-- Get users for the mobile login screen
--
-- IMPORTANT:
-- pin_hash and password are NEVER returned to the mobile app.
-- ============================================================================

create or replace function public.get_mobile_users()
returns table (
  id uuid,
  name text
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.name
  from public.users u
  where u.pin_hash is not null
  order by u.name;
$$;


-- ============================================================================
-- Verify mobile PIN
--
-- The PIN is checked inside PostgreSQL.
-- The mobile app never receives pin_hash.
-- ============================================================================

create or replace function public.verify_mobile_pin(
  p_user_id uuid,
  p_pin text
)
returns table (
  id uuid,
  name text
)
language plpgsql
security definer
set search_path = public
as $$
begin

  return query
  select
    u.id,
    u.name
  from public.users u
  where u.id = p_user_id
    and u.pin_hash is not null
    and u.pin_hash = crypt(p_pin, u.pin_hash);

end;
$$;