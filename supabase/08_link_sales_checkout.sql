-- BEARN FLOW + SALES MIGRATION (08)
-- Apply after 00..07. Payment confirmation must be performed by a trusted
-- server webhook using the Supabase service role. Never expose service role in browser.
alter table public.auto_links
  add column if not exists access_mode text not null default 'free_tags'
    check (access_mode in ('free_tags','paid_direct')),
  add column if not exists price bigint not null default 0 check(price >= 0);

create table if not exists public.auto_link_orders (
  id uuid primary key default gen_random_uuid(),
  auto_link_id uuid not null references public.auto_links(id) on delete restrict,
  buyer_user_id uuid references auth.users(id) on delete set null,
  buyer_email text,
  gross_amount bigint not null default 3500 check(gross_amount=3500),
  creator_net bigint not null default 3500 check(creator_net>=0),
  status text not null default 'pending' check(status in ('pending','paid','failed','expired','refunded')),
  provider text,
  provider_reference text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.auto_link_orders enable row level security;
alter table public.payment_link_orders
  add column if not exists checkout_reference text unique;

drop policy if exists "auto orders buyer read" on public.auto_link_orders;
create policy "auto orders buyer read" on public.auto_link_orders
  for select to authenticated using(buyer_user_id=auth.uid());
drop policy if exists "auto orders owner read" on public.auto_link_orders;
create policy "auto orders owner read" on public.auto_link_orders
  for select to authenticated using(exists(
    select 1 from public.auto_links a
    where a.id=auto_link_orders.auto_link_id and a.user_id=auth.uid()
  ));
drop policy if exists "payment orders seller read" on public.payment_link_orders;
create policy "payment orders seller read" on public.payment_link_orders
  for select to authenticated using(exists(
    select 1 from public.payment_links p
    where p.id=payment_link_orders.payment_link_id and p.user_id=auth.uid()
  ));

-- Only trusted server-side code should create/mark orders paid. No client insert/update policies.
revoke insert, update, delete on public.auto_link_orders from anon, authenticated;
revoke insert, update, delete on public.payment_link_orders from anon, authenticated;

create or replace function public.credit_paid_link_order()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid;
  v_amount bigint;
  v_ref_type text;
begin
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
    if tg_table_name='payment_link_orders' then
      select user_id into v_owner from public.payment_links where id=new.payment_link_id;
      v_amount := new.creator_net;
      v_ref_type := 'payment_link_order';
    else
      select user_id into v_owner from public.auto_links where id=new.auto_link_id;
      v_amount := new.creator_net;
      v_ref_type := 'auto_link_order';
    end if;

    if v_owner is null then raise exception 'Link owner not found'; end if;
    insert into public.wallet_accounts(user_id) values(v_owner) on conflict(user_id) do nothing;
    if not exists(select 1 from public.wallet_transactions
                  where reference_type=v_ref_type and reference_id=new.id and direction='credit') then
      update public.wallet_accounts
        set earning_balance=earning_balance+v_amount, updated_at=now()
        where user_id=v_owner;
      insert into public.wallet_transactions(user_id,bucket,direction,amount,reference_type,reference_id,note)
      values(v_owner,'earning','credit',v_amount,v_ref_type,new.id,'Pendapatan link terverifikasi');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists credit_payment_link_order on public.payment_link_orders;
create trigger credit_payment_link_order
after insert or update of status on public.payment_link_orders
for each row execute function public.credit_paid_link_order();

drop trigger if exists credit_auto_link_order on public.auto_link_orders;
create trigger credit_auto_link_order
after insert or update of status on public.auto_link_orders
for each row execute function public.credit_paid_link_order();

-- Owner-only per-link sales report.
create or replace function public.get_my_link_sales()
returns table(link_type text, link_id uuid, paid_count bigint, gross_total bigint, creator_total bigint)
language sql stable security invoker
set search_path=public
as $$
  select 'payment'::text, p.id, count(o.id) filter(where o.status='paid'),
         coalesce(sum(o.gross_amount) filter(where o.status='paid'),0)::bigint,
         coalesce(sum(o.creator_net) filter(where o.status='paid'),0)::bigint
  from public.payment_links p left join public.payment_link_orders o on o.payment_link_id=p.id
  where p.user_id=auth.uid() group by p.id
  union all
  select 'auto'::text, a.id, count(o.id) filter(where o.status='paid'),
         coalesce(sum(o.gross_amount) filter(where o.status='paid'),0)::bigint,
         coalesce(sum(o.creator_net) filter(where o.status='paid'),0)::bigint
  from public.auto_links a left join public.auto_link_orders o on o.auto_link_id=a.id
  where a.user_id=auth.uid() group by a.id;
$$;
grant execute on function public.get_my_link_sales() to authenticated;

create or replace function public.get_dashboard_metrics()
returns jsonb
language plpgsql stable security invoker
set search_path=public
as $$
declare v_uid uuid := auth.uid(); result jsonb;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select jsonb_build_object(
  'auto_link_count',(select count(*) from public.auto_links where user_id=v_uid),
  'payment_link_count',(select count(*) from public.payment_links where user_id=v_uid),
  'payment_link_paid_count',(select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid'),
  'auto_link_paid_count',(select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid'),
  'payment_link_revenue',(select coalesce(sum(o.creator_net),0) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid'),
  'auto_link_revenue',(select coalesce(sum(o.creator_net),0) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid'),
  'sales_today',(
    (select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid' and o.paid_at::date=current_date)
    +(select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid' and o.paid_at::date=current_date)
  ),
  'sales_total',(
    (select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid')
    +(select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid')
  )
 ) into result;
 return result;
end;
$$;
grant execute on function public.get_dashboard_metrics() to authenticated;
