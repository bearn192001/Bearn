-- BEARN MIGRATION 15: PUBLIC HOME PAGE AGGREGATE STATISTICS.
-- Exposes aggregate counts only; no user-identifying data is returned.
-- Apply after migrations 00..14.

create or replace function public.get_public_home_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_users', (select count(*) from auth.users),
    'total_shared_links',
      (select count(*) from public.auto_links where is_published = true)
      + (select count(*) from public.payment_links where is_active = true),
    'total_paid_withdrawals',
      (select count(*) from public.withdraw_requests where status = 'paid')
  );
$$;

revoke all on function public.get_public_home_stats() from public, anon, authenticated;
grant execute on function public.get_public_home_stats() to anon, authenticated;
