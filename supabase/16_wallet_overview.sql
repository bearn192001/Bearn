-- BEARN MIGRATION 16: WALLET OVERVIEW + FILTERED EARNING HISTORY.
-- Safe to re-run. Wallet reads are limited by RLS to auth.uid().

-- RLS policies alone are not enough: authenticated also needs SELECT privileges.
-- Keep these grants read-only; all wallet mutations remain server-side.
grant usage on schema public to authenticated;
grant select on table public.wallet_accounts, public.wallet_transactions to authenticated;

alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet read self" on public.wallet_accounts;
create policy "wallet read self" on public.wallet_accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "transactions read self" on public.wallet_transactions;
create policy "transactions read self" on public.wallet_transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

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
  v_start date := coalesce(p_start_date, (now() at time zone 'Asia/Jakarta')::date);
  v_end date := coalesce(p_end_date, (now() at time zone 'Asia/Jakarta')::date);
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'Sesi login tidak ditemukan. Silakan login kembali.';
  end if;

  if v_end < v_start then
    raise exception using errcode = '22007', message = 'Tanggal akhir tidak boleh lebih awal dari tanggal awal.';
  end if;

  if (v_end - v_start) > 366 then
    raise exception using errcode = '22023', message = 'Rentang tanggal maksimal 367 hari.';
  end if;

  select jsonb_build_object(
    'available_balance',
      coalesce((
        select wa.earning_balance
        from public.wallet_accounts wa
        where wa.user_id = v_uid
      ), 0),
    'topup_balance',
      coalesce((
        select wa.topup_balance
        from public.wallet_accounts wa
        where wa.user_id = v_uid
      ), 0),
    'auto_link_balance',
      coalesce((
        select sum(wt.amount)
        from public.wallet_transactions wt
        where wt.user_id = v_uid
          and wt.bucket = 'earning'
          and wt.direction = 'credit'
          and wt.reference_type in ('auto_link_view', 'auto_link_order')
      ), 0),
    'payment_link_balance',
      coalesce((
        select sum(wt.amount)
        from public.wallet_transactions wt
        where wt.user_id = v_uid
          and wt.bucket = 'earning'
          and wt.direction = 'credit'
          and wt.reference_type = 'payment_link_order'
      ), 0),
    'month_earnings',
      coalesce((
        select sum(wt.amount)
        from public.wallet_transactions wt
        where wt.user_id = v_uid
          and wt.bucket = 'earning'
          and wt.direction = 'credit'
          and wt.created_at >= (date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')
          and wt.created_at < ((date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '1 month') at time zone 'Asia/Jakarta')
      ), 0),
    'range_earnings',
      coalesce((
        select sum(wt.amount)
        from public.wallet_transactions wt
        where wt.user_id = v_uid
          and wt.bucket = 'earning'
          and wt.direction = 'credit'
          and wt.created_at >= (v_start::timestamp at time zone 'Asia/Jakarta')
          and wt.created_at < ((v_end + 1)::timestamp at time zone 'Asia/Jakarta')
      ), 0),
    'range_start', v_start,
    'range_end', v_end,
    'total_count',
      (
        select count(*)
        from public.wallet_transactions wt
        where wt.user_id = v_uid
          and wt.bucket = 'earning'
          and wt.direction = 'credit'
          and wt.created_at >= (v_start::timestamp at time zone 'Asia/Jakarta')
          and wt.created_at < ((v_end + 1)::timestamp at time zone 'Asia/Jakarta')
      ),
    'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
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
          ) order by q.created_at desc, q.id desc
        )
        from (
          select wt.id, wt.amount, wt.note, wt.reference_type, wt.created_at
          from public.wallet_transactions wt
          where wt.user_id = v_uid
            and wt.bucket = 'earning'
            and wt.direction = 'credit'
            and wt.created_at >= (v_start::timestamp at time zone 'Asia/Jakarta')
            and wt.created_at < ((v_end + 1)::timestamp at time zone 'Asia/Jakarta')
          order by wt.created_at desc, wt.id desc
          limit v_limit offset v_offset
        ) q
      ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_my_wallet_overview(date, date, integer, integer) from public, anon;
grant execute on function public.get_my_wallet_overview(date, date, integer, integer) to authenticated;
