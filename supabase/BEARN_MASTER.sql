-- BEARN MASTER SQL — generated from the numbered domain migrations.
-- Run once in Supabase SQL Editor, in this exact order.


-- ===== 00_auth_profiles.sql =====
-- BEARN AUTH & PROFILE. Authentication is managed by Supabase Auth (auth.users).
create table if not exists public.profiles (user_id uuid primary key references auth.users(id) on delete cascade, full_name text, username text unique, avatar_url text, role text not null default 'member' check(role in ('member','admin')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.profiles enable row level security;
drop policy if exists "profiles read self" on public.profiles;
create policy "profiles read self" on public.profiles for select to authenticated using(user_id=auth.uid());
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(user_id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')); insert into public.wallet_accounts(user_id) values(new.id) on conflict do nothing; return new; end; $$;

-- Prevent a member from promoting their own profile to admin through the public API.
create or replace function public.prevent_profile_role_escalation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role is distinct from old.role and auth.uid() = old.user_id then
    raise exception 'Role changes must be performed by a trusted administrator.';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_profile_role_escalation on public.profiles;
create trigger prevent_profile_role_escalation before update on public.profiles for each row execute function public.prevent_profile_role_escalation();


-- ===== 01_wallet_transactions.sql =====
-- WALLET: topup and creator earnings are separate buckets.
create table if not exists public.wallet_accounts(user_id uuid primary key references auth.users(id) on delete cascade, topup_balance bigint not null default 0 check(topup_balance>=0), earning_balance bigint not null default 0 check(earning_balance>=0), updated_at timestamptz not null default now());
create table if not exists public.wallet_transactions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, bucket text not null check(bucket in ('topup','earning')), direction text not null check(direction in ('credit','debit')), amount bigint not null check(amount>0), reference_type text, reference_id uuid, note text, created_at timestamptz not null default now());
alter table public.wallet_accounts enable row level security; alter table public.wallet_transactions enable row level security;
create policy "wallet read self" on public.wallet_accounts for select to authenticated using(user_id=auth.uid()); create policy "transactions read self" on public.wallet_transactions for select to authenticated using(user_id=auth.uid());

-- Create the profile + wallet row automatically for new Supabase Auth users.
drop trigger if exists on_auth_user_created_bearn on auth.users;
create trigger on_auth_user_created_bearn after insert on auth.users for each row execute function public.handle_new_user();


-- ===== 02_auto_links.sql =====
-- AUTO LINK. The destination is only used by the controlled redirect endpoint.
create table if not exists public.auto_links(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, slug text not null unique, destination_url text not null, is_published boolean not null default false, click_count bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint auto_links_https check(destination_url ~ '^https?://'));
alter table public.auto_links enable row level security; create policy "auto links public read published" on public.auto_links for select using(is_published=true or auth.uid()=user_id); create policy "auto links owner insert" on public.auto_links for insert to authenticated with check(user_id=auth.uid()); create policy "auto links owner update" on public.auto_links for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); create policy "auto links owner delete" on public.auto_links for delete to authenticated using(user_id=auth.uid());


-- ===== 03_payment_links.sql =====
-- PAYMENT LINK. Gateway fields intentionally remain pending until provider is chosen.
create table if not exists public.payment_links(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, description text, slug text not null unique, price bigint not null check(price>=1000), platform_fee bigint generated always as (round(price*0.10)::bigint) stored, creator_net bigint generated always as (price-round(price*0.10)::bigint) stored, is_active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.payment_link_orders(id uuid primary key default gen_random_uuid(), payment_link_id uuid not null references public.payment_links(id), buyer_user_id uuid references auth.users(id), buyer_email text, gross_amount bigint not null, platform_fee bigint not null, creator_net bigint not null, status text not null default 'pending' check(status in ('pending','paid','failed','expired','refunded')), provider text, provider_reference text, paid_at timestamptz, created_at timestamptz not null default now());
alter table public.payment_links enable row level security; alter table public.payment_link_orders enable row level security; create policy "payment links public read active" on public.payment_links for select using(is_active=true or auth.uid()=user_id); create policy "payment links owner insert" on public.payment_links for insert to authenticated with check(user_id=auth.uid()); create policy "payment links owner update" on public.payment_links for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); create policy "orders buyer read" on public.payment_link_orders for select to authenticated using(buyer_user_id=auth.uid());


-- ===== 04_vip_legacy.sql =====
-- VIP retained only as a legacy/optional entitlement table; no VIP menu is exposed in BEARN UI.
create table if not exists public.vip_memberships(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, status text not null default 'inactive' check(status in ('inactive','active','expired','cancelled')), starts_at timestamptz, expires_at timestamptz, created_at timestamptz not null default now()); alter table public.vip_memberships enable row level security; create policy "vip self read" on public.vip_memberships for select to authenticated using(user_id=auth.uid());


-- ===== 05_endorse.sql =====
-- ENDORSE requests and admin decision.
create table if not exists public.endorse_requests(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, description text, image_url text, target_url text, budget bigint, status text not null default 'pending' check(status in ('pending','reviewing','approved','rejected','completed')), admin_note text, created_at timestamptz not null default now()); alter table public.endorse_requests enable row level security; create policy "endorse owner read" on public.endorse_requests for select to authenticated using(user_id=auth.uid()); create policy "endorse owner create" on public.endorse_requests for insert to authenticated with check(user_id=auth.uid());


-- ===== 06_announcements_notifications.sql =====
-- ADMIN ANNOUNCEMENTS + USER NOTIFICATIONS.
create table if not exists public.announcements(id uuid primary key default gen_random_uuid(), title text not null, body text not null, is_published boolean not null default false, published_at timestamptz, created_at timestamptz not null default now()); create table if not exists public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, body text, read_at timestamptz, created_at timestamptz not null default now()); alter table public.announcements enable row level security; alter table public.notifications enable row level security; create policy "published announcements public" on public.announcements for select using(is_published=true); create policy "notifications self read" on public.notifications for select to authenticated using(user_id=auth.uid()); create policy "notifications self update" on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());


-- ===== 07_withdraw_chat_referral.sql =====
-- WITHDRAW, SUPPORT CHAT AND REFERRAL.
create table if not exists public.withdraw_requests(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, amount bigint not null check(amount>=10000), destination_name text not null, destination_account text not null, status text not null default 'pending' check(status in ('pending','approved','rejected','paid')), admin_note text, created_at timestamptz not null default now()); create table if not exists public.support_threads(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, subject text, status text not null default 'open' check(status in ('open','closed')), created_at timestamptz not null default now()); create table if not exists public.support_messages(id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.support_threads(id) on delete cascade, sender_id uuid not null references auth.users(id), message text not null, created_at timestamptz not null default now()); create table if not exists public.referrals(id uuid primary key default gen_random_uuid(), referrer_id uuid not null references auth.users(id) on delete cascade, referred_user_id uuid unique references auth.users(id) on delete set null, referral_code text not null, status text not null default 'pending' check(status in ('pending','qualified','rewarded','rejected')), reward_amount bigint not null default 0, created_at timestamptz not null default now()); alter table public.withdraw_requests enable row level security; alter table public.support_threads enable row level security; alter table public.support_messages enable row level security; alter table public.referrals enable row level security; create policy "withdraw self read" on public.withdraw_requests for select to authenticated using(user_id=auth.uid()); create policy "withdraw self insert" on public.withdraw_requests for insert to authenticated with check(user_id=auth.uid()); create policy "support self read" on public.support_threads for select to authenticated using(user_id=auth.uid()); create policy "support self create" on public.support_threads for insert to authenticated with check(user_id=auth.uid()); create policy "referrals self read" on public.referrals for select to authenticated using(referrer_id=auth.uid());


-- ===== 08_link_sales_checkout.sql =====

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
