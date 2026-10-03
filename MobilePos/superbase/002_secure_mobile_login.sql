-- ============================================================================
-- 002 · Secure mobile login
--
-- Replaces public.login_with_email from 001. Run this in the Supabase SQL
-- editor. It is safe to run more than once.
--
-- What it does
--   * The password is checked only inside Postgres. The mobile app never
--     reads public.users directly and never receives password_hash.
--   * Works with TODAY's plain-text passwords AND with hashed passwords, so
--     the offline POS can start syncing hashes later with no app change:
--       - bcrypt  ($2a$ / $2b$ / $2y$ …)  e.g. bcrypt libraries, pgcrypto gen_salt('bf')
--       - md5-crypt ($1$ …)
--       - anything else is treated as a legacy plain-text password
--     A stored hash typed in as the "password" never matches.
--   * Users can sign in with their email or their name (case-insensitive).
--     If the login is ambiguous (two active users match) nobody is signed in.
--   * Brute-force protection: after 5 failed attempts for the same login in
--     15 minutes, further attempts fail with TOO_MANY_ATTEMPTS until the
--     window passes.
--
-- Hashing passwords later (example, run once when ready):
--   update public.users
--      set password_hash = crypt(password_hash, gen_salt('bf'))
--    where password_hash is not null
--      and public.mobile_password_kind(password_hash) = 'plain';
-- ============================================================================

create extension if not exists pgcrypto;


-- ----------------------------------------------------------------------------
-- Classifies a stored password value: 'bcrypt', 'md5crypt', 'plain' or 'none'.
-- ----------------------------------------------------------------------------
create or replace function public.mobile_password_kind(p_stored text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when p_stored is null or p_stored = '' then 'none'
    when p_stored ~ '^\$2[abxy]?\$[0-9]{2}\$[./A-Za-z0-9]{53}$' then 'bcrypt'
    when p_stored ~ '^\$1\$[^$]{1,8}\$[./A-Za-z0-9]{22}$' then 'md5crypt'
    else 'plain'
  end;
$$;


-- ----------------------------------------------------------------------------
-- True when p_password matches the stored value (hashed or legacy plain text).
-- ----------------------------------------------------------------------------
create or replace function public.mobile_password_matches(p_password text, p_stored text)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v_kind text := public.mobile_password_kind(p_stored);
  v_hash text;
begin
  if p_password is null or p_password = '' then
    return false;
  end if;

  if v_kind = 'bcrypt' then
    -- pgcrypto only understands the $2a$ prefix; $2b$/$2y$ hashes are
    -- otherwise identical, so normalise before comparing.
    v_hash := '$2a$' || substr(p_stored, strpos(substr(p_stored, 2), '$') + 2);
    return crypt(p_password, v_hash) = v_hash;
  elsif v_kind = 'md5crypt' then
    return crypt(p_password, p_stored) = p_stored;
  elsif v_kind = 'plain' then
    return p_password = p_stored;
  end if;

  return false;
end;
$$;


-- ----------------------------------------------------------------------------
-- Failed-login log for brute-force protection. Only the security-definer
-- login function touches it; RLS with no policies hides it from the app.
-- ----------------------------------------------------------------------------
create table if not exists public.mobile_login_attempts (
  id bigint generated always as identity primary key,
  login text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists mobile_login_attempts_login_time_idx
  on public.mobile_login_attempts (login, attempted_at desc);

alter table public.mobile_login_attempts enable row level security;
revoke all on public.mobile_login_attempts from anon, authenticated;


-- ----------------------------------------------------------------------------
-- Login. Returns exactly one row on success, no rows on bad credentials.
-- Raises 'TOO_MANY_ATTEMPTS' while the login is locked out.
-- (Parameter keeps the name p_email for compatibility; it also accepts a name.)
-- ----------------------------------------------------------------------------
drop function if exists public.login_with_email(text, text);

create function public.login_with_email(
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
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_login text := lower(trim(coalesce(p_email, '')));
  v_failures integer;
  v_matched integer;
begin
  if v_login = '' or coalesce(p_password, '') = '' then
    return;
  end if;

  select count(*) into v_failures
    from public.mobile_login_attempts a
   where a.login = v_login
     and a.succeeded = false
     and a.attempted_at > now() - interval '15 minutes';

  if v_failures >= 5 then
    raise exception 'TOO_MANY_ATTEMPTS' using errcode = 'P0001',
      hint = 'Too many failed sign-in attempts. Try again in 15 minutes.';
  end if;

  return query
  with matched as (
    select u.id, u.name::text as name, u.email::text as email, u.role::text as role
      from public.users u
     where u.is_active = true
       and (lower(u.email) = v_login or lower(u.name) = v_login)
       and public.mobile_password_matches(p_password, u.password_hash)
  )
  select m.id, m.name, m.email, m.role
    from matched m
   where (select count(*) from matched) = 1;

  get diagnostics v_matched = row_count;

  insert into public.mobile_login_attempts (login, succeeded)
  values (v_login, v_matched = 1);

  -- Keep the log small: drop entries older than a day.
  delete from public.mobile_login_attempts
   where attempted_at < now() - interval '1 day';
end;
$$;

revoke all on function public.login_with_email(text, text) from public;
grant execute on function public.login_with_email(text, text) to anon, authenticated;

revoke all on function public.mobile_password_matches(text, text) from public, anon, authenticated;
revoke all on function public.mobile_password_kind(text) from public, anon, authenticated;
