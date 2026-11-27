-- BEARN MIGRATION 14: grant the Cloudflare Pages server role access to Auto Link rows.
-- Run this in Supabase SQL Editor. The API reads Auto Links with
-- SUPABASE_SERVICE_ROLE_KEY, so the service_role must have table privileges.
-- Row Level Security remains enabled; service_role bypasses RLS by design.

grant select, insert, update, delete on table public.auto_links to service_role;

-- The creator-facing browser client continues to be constrained by the
-- existing authenticated grants and RLS policies. Do not grant anon access.
