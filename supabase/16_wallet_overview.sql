-- BEARN MIGRATION 16: OWNER WALLET OVERVIEW + FILTERED EARNING HISTORY.
-- Apply after migrations 00..15. All results are scoped to auth.uid().

create or replace function public.get_my_wallet_overview(
  p_start_date date,
  p_end_date date,
  p_limit integer default 5,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_start date := coalesce(p_start_date, current_date);
  v_end date := coalesce(p_end_date, current_date);
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if v_end < v_start then
    raise exception 'Tanggal akhir tidak boleh lebih awal dari tanggal awal';
  end if;
  if (v_end - v_start) > 366 then
    raise exception 'Rentang tanggal maksimal 367 hari';
  end if;

  select jsonb_build_object(
    'available_balance',
      coalesce((select earning_balance from public.wallet_accounts where user_id = v_uid), 0),
    'topup_balance',
      coalesce((select topup_balance from public.wallet_accounts where user_id = v_uid), 0),
    'auto_link_balance',
      coalesce((select sum(amount) from public.wallet_transactions
        where user_id = v_uid and bucket = 'earning' and direction = 'credit'
          and reference_type in ('auto_link_view', 'auto_link_order')), 0),
    'payment_link_balance',
      coalesce((select sum(amount) from public.wallet_transactions
        where user_id = v_uid and bucket = 'earning' and direction = 'credit'
          and reference_type = 'payment_link_order'), 0),
    'month_earnings',
      coalesce((select sum(amount) from public.wallet_transactions
        where user_id = v_uid and bucket = 'earning' and direction = 'credit'
          and created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')
          and created_at < ((date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta') + interval '1 month') AT TIME ZONE 'Asia/Jakarta')), 0),
    'range_earnings',
      coalesce((select sum(amount) from public.wallet_transactions
        where user_id = v_uid and bucket = 'earning' and direction = 'credit'
          and created_at >= (v_start::timestamp AT TIME ZONE 'Asia/Jakarta')
          and created_at < ((v_end + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')), 0),
    'range_start', v_start,
    'range_end', v_end,
    'total_count',
      (select count(*) from public.wallet_transactions
        where user_id = v_uid and bucket = 'earning' and direction = 'credit'
          and created_at >= (v_start::timestamp AT TIME ZONE 'Asia/Jakarta')
          and created_at < ((v_end + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')),
    'items',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.id,
          'amount', q.amount,
          'note', q.note,
          'reference_type', q.reference_type,
          'created_at', q.created_at,
          'category', case
            when q.reference_type in ('auto_link_view', 'auto_link_order') then 'Auto Link'
            when q.reference_type = 'payment_link_order' then 'Payment Link'
            else 'Pendapatan'
          end
        ) order by q.created_at desc)
        from (
          select id, amount, note, reference_type, created_at
          from public.wallet_transactions
          where user_id = v_uid and bucket = 'earning' and direction = 'credit'
            and created_at >= (v_start::timestamp AT TIME ZONE 'Asia/Jakarta')
            and created_at < ((v_end + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
          order by created_at desc
          limit v_limit offset v_offset
        ) q
      ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_my_wallet_overview(date, date, integer, integer) from public, anon;
grant execute on function public.get_my_wallet_overview(date, date, integer, integer) to authenticated;
