-- ============================================================
-- CyberShield NIC — Provision Admin User
-- ============================================================
-- Run this in the Supabase SQL Editor using the service-role key
-- (Dashboard -> SQL -> New query).
--
-- Replace '<USER_EMAIL>' with the email of the user to promote.
-- The user must already exist in auth.users (i.e., they must have
-- signed up or been created via the Auth API).
--
-- This sets app_metadata.role = 'admin', which is the ONLY source
-- of truth for admin privileges (see shared/auth.py). User metadata
-- (raw_user_meta_data) is user-writable and MUST NOT be trusted.
-- ============================================================

-- Step 1: Find the user's UUID by email
-- (Uncomment and run to look up the ID first)
-- SELECT id, email, raw_app_meta_data FROM auth.users WHERE email = '<USER_EMAIL>';

-- Step 2: Set the admin role in app_metadata
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = '<USER_EMAIL>';

-- Step 3: Verify the change
SELECT id, email, raw_app_meta_data
FROM auth.users
WHERE email = '<USER_EMAIL>';
