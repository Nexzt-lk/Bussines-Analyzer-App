-- ============================================================================
-- 003 · Stop the mobile app's public key from reading public.users
--
-- After 002, the mobile app signs in only through login_with_email(), so it
-- never needs to read public.users. Without this step, anyone who extracts
-- the publishable key from the app can download every user's password.
--
-- ⚠ BEFORE RUNNING: check how the offline POS syncs to Supabase.
--   * If the sync uses the SERVICE ROLE key (recommended), it is unaffected —
--     the service role bypasses these grants and RLS.
--   * If the sync uses the anon/publishable key, this WILL break user sync.
--     Move the sync to the service-role key first.
-- ============================================================================

revoke all on public.users from anon, authenticated;
alter table public.users enable row level security;

-- Supabase may later re-grant defaults on new columns; re-run this file
-- after schema changes to the users table.
