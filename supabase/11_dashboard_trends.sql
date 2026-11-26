-- BEARN MIGRATION 11: DASHBOARD KPI TRENDS AND DAILY SERIES.
-- Apply after supabase/10_auto_link_tracking.sql. Replaces the earlier
-- get_dashboard_metrics() with owner-scoped lifetime KPIs + 7-day comparisons.

create or replace function public.get_dashboard_metrics()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_auto_daily jsonb;
  v_payment_daily jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'day', to_char(d.day, 'YYYY-MM-DD'),
      'views', coalesce(v.views, 0),
      'sales', coalesce(s.sales, 0),
      'revenue', coalesce(v.earnings, 0) + coalesce(s.earnings, 0)
    ) order by d.day), '[]'::jsonb)
    into v_auto_daily
  from generate_series(current_date - 6, current_date, interval '1 day') as d(day)
  left join lateral (
    select count(*)::bigint as views, coalesce(sum(e.creator_earning), 0)::bigint as earnings
    from public.auto_link_view_events e
    where e.owner_user_id = v_uid
      and e.created_at >= d.day::date
      and e.created_at < (d.day::date + 1)
  ) v on true
  left join lateral (
    select count(*)::bigint as sales, coalesce(sum(o.creator_net), 0)::bigint as earnings
    from public.auto_link_orders o
    join public.auto_links a on a.id = o.auto_link_id
    where a.user_id = v_uid and o.status = 'paid'
      and coalesce(o.paid_at, o.created_at) >= d.day::date
      and coalesce(o.paid_at, o.created_at) < (d.day::date + 1)
  ) s on true;

  select coalesce(jsonb_agg(jsonb_build_object(
      'day', to_char(d.day, 'YYYY-MM-DD'),
      'sales', coalesce(s.sales, 0),
      'revenue', coalesce(s.earnings, 0)
    ) order by d.day), '[]'::jsonb)
    into v_payment_daily
  from generate_series(current_date - 6, current_date, interval '1 day') as d(day)
  left join lateral (
    select count(*)::bigint as sales, coalesce(sum(o.creator_net), 0)::bigint as earnings
    from public.payment_link_orders o
    join public.payment_links p on p.id = o.payment_link_id
    where p.user_id = v_uid and o.status = 'paid'
      and coalesce(o.paid_at, o.created_at) >= d.day::date
      and coalesce(o.paid_at, o.created_at) < (d.day::date + 1)
  ) s on true;

  select jsonb_build_object(
    'auto_link_count', (select count(*) from public.auto_links where user_id = v_uid),
    'payment_link_count', (select count(*) from public.payment_links where user_id = v_uid),
    'auto_link_view_count', (select count(*) from public.auto_link_view_events where owner_user_id = v_uid),
    'auto_link_view_revenue', (select coalesce(sum(creator_earning), 0) from public.auto_link_view_events where owner_user_id = v_uid),
    'auto_link_paid_count', (select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid'),
    'auto_link_revenue', (select coalesce(sum(o.creator_net), 0) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid'),
    'auto_link_total_revenue',
      (select coalesce(sum(creator_earning), 0) from public.auto_link_view_events where owner_user_id=v_uid)
      + (select coalesce(sum(o.creator_net), 0) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid'),
    'payment_link_paid_count', (select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid'),
    'payment_link_revenue', (select coalesce(sum(o.creator_net), 0) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid'),

    'auto_link_new_7d', (select count(*) from public.auto_links where user_id=v_uid and created_at >= current_date - 6 and created_at < current_date + 1),
    'auto_link_new_prev_7d', (select count(*) from public.auto_links where user_id=v_uid and created_at >= current_date - 13 and created_at < current_date - 6),
    'auto_link_views_7d', (select count(*) from public.auto_link_view_events where owner_user_id=v_uid and created_at >= current_date - 6 and created_at < current_date + 1),
    'auto_link_views_prev_7d', (select count(*) from public.auto_link_view_events where owner_user_id=v_uid and created_at >= current_date - 13 and created_at < current_date - 6),
    'auto_link_sales_7d', (select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid' and coalesce(o.paid_at,o.created_at) >= current_date - 6 and coalesce(o.paid_at,o.created_at) < current_date + 1),
    'auto_link_sales_prev_7d', (select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid' and coalesce(o.paid_at,o.created_at) >= current_date - 13 and coalesce(o.paid_at,o.created_at) < current_date - 6),
    'auto_link_revenue_7d',
      (select coalesce(sum(creator_earning),0) from public.auto_link_view_events where owner_user_id=v_uid and created_at >= current_date - 6 and created_at < current_date + 1)
      + (select coalesce(sum(o.creator_net),0) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid' and coalesce(o.paid_at,o.created_at) >= current_date - 6 and coalesce(o.paid_at,o.created_at) < current_date + 1),
    'auto_link_revenue_prev_7d',
      (select coalesce(sum(creator_earning),0) from public.auto_link_view_events where owner_user_id=v_uid and created_at >= current_date - 13 and created_at < current_date - 6)
      + (select coalesce(sum(o.creator_net),0) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid' and coalesce(o.paid_at,o.created_at) >= current_date - 13 and coalesce(o.paid_at,o.created_at) < current_date - 6),
    'payment_link_sales_7d', (select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid' and coalesce(o.paid_at,o.created_at) >= current_date - 6 and coalesce(o.paid_at,o.created_at) < current_date + 1),
    'payment_link_sales_prev_7d', (select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid' and coalesce(o.paid_at,o.created_at) >= current_date - 13 and coalesce(o.paid_at,o.created_at) < current_date - 6),
    'payment_link_revenue_7d', (select coalesce(sum(o.creator_net),0) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid' and coalesce(o.paid_at,o.created_at) >= current_date - 6 and coalesce(o.paid_at,o.created_at) < current_date + 1),
    'payment_link_revenue_prev_7d', (select coalesce(sum(o.creator_net),0) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid' and coalesce(o.paid_at,o.created_at) >= current_date - 13 and coalesce(o.paid_at,o.created_at) < current_date - 6),
    'auto_link_daily', v_auto_daily,
    'payment_link_daily', v_payment_daily
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_dashboard_metrics() to authenticated;
