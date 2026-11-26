-- BEARN MIGRATION 10: SERVER-VERIFIED AUTO LINK FLOW, UNIQUE VIEWS AND EARNINGS.
-- Apply after 00..09. Cloudflare Pages Functions require SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY environment secrets. Never expose the service key in browser JS.

-- 1) Hide the actual destination URL from public/browser SELECTs.
-- The redirect endpoint reads it only inside a trusted SQL function.
revoke all privileges on table public.auto_links from anon, authenticated;
grant select (id, user_id, title, slug, is_published, click_count, created_at, updated_at, access_mode, price)
  on table public.auto_links to anon, authenticated;
grant insert (user_id, title, slug, destination_url, is_published, access_mode, price)
  on table public.auto_links to authenticated;
grant update (title, destination_url, is_published, access_mode, price, updated_at)
  on table public.auto_links to authenticated;
grant delete on table public.auto_links to authenticated;

-- 2) Correct the direct Auto Link sale split for new orders.
-- Buyer pays Rp3,500; owner receives Rp2,000; BEARN receives Rp1,500.
alter table public.auto_link_orders
  add column if not exists platform_fee bigint;
update public.auto_link_orders
  set platform_fee = gross_amount - creator_net
  where platform_fee is null;
alter table public.auto_link_orders alter column gross_amount set default 3500;
alter table public.auto_link_orders alter column creator_net set default 2000;
alter table public.auto_link_orders alter column platform_fee set default 1500;
alter table public.auto_link_orders alter column platform_fee set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'auto_link_order_fee_balance_check'
      and conrelid = 'public.auto_link_orders'::regclass
  ) then
    alter table public.auto_link_orders
      add constraint auto_link_order_fee_balance_check
      check (platform_fee >= 0 and creator_net + platform_fee = gross_amount);
  end if;
end $$;

create or replace function public.set_auto_link_order_amounts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  new.gross_amount := 3500;
  new.platform_fee := 1500;
  new.creator_net := 2000;
  return new;
end;
$$;
drop trigger if exists set_auto_link_order_amounts_before_insert on public.auto_link_orders;
create trigger set_auto_link_order_amounts_before_insert
before insert on public.auto_link_orders
for each row execute function public.set_auto_link_order_amounts();

-- Payment Link fee is always calculated from the current link price, not client values.
create or replace function public.set_payment_link_order_amounts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_price bigint;
begin
  select price into v_price from public.payment_links where id = new.payment_link_id;
  if v_price is null then raise exception 'Payment Link tidak ditemukan'; end if;
  new.gross_amount := v_price;
  new.platform_fee := round(v_price * 0.10)::bigint;
  new.creator_net := v_price - new.platform_fee;
  return new;
end;
$$;
drop trigger if exists set_payment_link_order_amounts_before_insert on public.payment_link_orders;
create trigger set_payment_link_order_amounts_before_insert
before insert on public.payment_link_orders
for each row execute function public.set_payment_link_order_amounts();

-- 3) Server-created flow sessions. Raw tokens never enter the database.
create table if not exists public.auto_link_flow_sessions (
  id uuid primary key default gen_random_uuid(),
  auto_link_id uuid not null references public.auto_links(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  visitor_key text not null check (visitor_key ~ '^[a-f0-9]{64}$'),
  view_date date not null default current_date,
  tag1_completed boolean not null default false,
  tag2_completed boolean not null default false,
  tag3_completed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  redirected_at timestamptz
);
create index if not exists auto_link_flow_sessions_link_created_idx
  on public.auto_link_flow_sessions(auto_link_id, created_at desc);

-- 4) One valid view per link / visitor fingerprint / calendar day.
create table if not exists public.auto_link_view_events (
  id uuid primary key default gen_random_uuid(),
  auto_link_id uuid not null references public.auto_links(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  flow_session_id uuid not null unique references public.auto_link_flow_sessions(id) on delete restrict,
  visitor_key text not null check (visitor_key ~ '^[a-f0-9]{64}$'),
  view_date date not null,
  view_number bigint not null default 0,
  creator_earning bigint not null default 0 check (creator_earning >= 0),
  created_at timestamptz not null default now(),
  unique (auto_link_id, visitor_key, view_date)
);
create index if not exists auto_link_view_events_owner_created_idx
  on public.auto_link_view_events(owner_user_id, created_at desc);
alter table public.auto_link_flow_sessions enable row level security;
alter table public.auto_link_view_events enable row level security;
drop policy if exists "auto link view events owner read" on public.auto_link_view_events;
create policy "auto link view events owner read" on public.auto_link_view_events
  for select to authenticated using (owner_user_id = auth.uid());
revoke all privileges on table public.auto_link_flow_sessions from anon, authenticated;
revoke insert, update, delete on table public.auto_link_view_events from anon, authenticated;
grant select on table public.auto_link_view_events to authenticated;

-- 5) Editable CPM settings. Initial interpretation: Rp120,000 / 1,000 views;
-- 50% payout for views 1-1,000, then 100% from view 1,001 onward.
create table if not exists public.auto_link_earning_settings (
  id boolean primary key default true check (id),
  cpm_amount bigint not null default 120000 check (cpm_amount >= 0),
  early_rate_percent integer not null default 50 check (early_rate_percent between 0 and 100),
  early_view_limit bigint not null default 1000 check (early_view_limit >= 0),
  normal_rate_percent integer not null default 100 check (normal_rate_percent between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into public.auto_link_earning_settings(id) values(true) on conflict(id) do nothing;
alter table public.auto_link_earning_settings enable row level security;
revoke all privileges on table public.auto_link_earning_settings from anon, authenticated;

-- 6) Create a flow only for an active free Auto Link.
create or replace function public.bearn_start_auto_flow(p_slug text, p_token_hash text, p_visitor_key text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link_id uuid;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_visitor_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Token sesi tidak valid';
  end if;
  select id into v_link_id from public.auto_links
    where slug = p_slug and is_published = true and access_mode in ('free_tags','choice');
  if v_link_id is null then raise exception 'Auto Link gratis tidak ditemukan atau tidak aktif'; end if;
  insert into public.auto_link_flow_sessions(auto_link_id, token_hash, visitor_key, view_date)
    values(v_link_id, p_token_hash, p_visitor_key, current_date);
  return true;
end;
$$;

-- 7) Record tag stages in server storage and enforce the 1 -> 2 -> 3 sequence.
create or replace function public.bearn_complete_auto_flow_stage(p_token_hash text, p_stage integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.auto_link_flow_sessions%rowtype;
begin
  if p_stage not between 1 and 3 then return false; end if;
  select * into v_session from public.auto_link_flow_sessions
    where token_hash = p_token_hash for update;
  if not found or v_session.expires_at <= now() or v_session.redirected_at is not null then return false; end if;
  if p_stage = 1 then
    update public.auto_link_flow_sessions set tag1_completed = true where id = v_session.id;
  elsif p_stage = 2 then
    if not v_session.tag1_completed then return false; end if;
    update public.auto_link_flow_sessions set tag2_completed = true where id = v_session.id;
  elsif p_stage = 3 then
    if not v_session.tag1_completed or not v_session.tag2_completed then return false; end if;
    update public.auto_link_flow_sessions set tag3_completed = true where id = v_session.id;
  end if;
  return true;
end;
$$;

create or replace function public.bearn_get_auto_flow_status(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.auto_link_flow_sessions%rowtype;
begin
  select * into v_session from public.auto_link_flow_sessions where token_hash = p_token_hash;
  if not found or v_session.expires_at <= now() then
    return jsonb_build_object('valid', false, 'tag1', false, 'tag2', false, 'tag3', false);
  end if;
  return jsonb_build_object(
    'valid', true,
    'tag1', v_session.tag1_completed,
    'tag2', v_session.tag2_completed,
    'tag3', v_session.tag3_completed,
    'expires_at', v_session.expires_at,
    'redirected', v_session.redirected_at is not null
  );
end;
$$;

-- 8) Issue the destination URL only after all stages are recorded server-side.
-- The DB transaction counts/credits at most one visitor per link per day.
create or replace function public.bearn_finalize_auto_flow(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.auto_link_flow_sessions%rowtype;
  v_link public.auto_links%rowtype;
  v_settings public.auto_link_earning_settings%rowtype;
  v_event_id uuid;
  v_view_number bigint;
  v_view_count bigint;
  v_rate integer;
  v_earning bigint := 0;
  v_counted boolean := false;
begin
  select * into v_session from public.auto_link_flow_sessions
    where token_hash = p_token_hash for update;
  if not found or v_session.expires_at <= now() then raise exception 'Sesi tidak valid atau kedaluwarsa'; end if;
  select * into v_link from public.auto_links where id = v_session.auto_link_id for update;
  if not found or not v_link.is_published or v_link.access_mode not in ('free_tags','choice') then
    raise exception 'Auto Link tidak aktif';
  end if;
  if not (v_session.tag1_completed and v_session.tag2_completed and v_session.tag3_completed) then
    raise exception 'Semua tahap belum selesai';
  end if;
  if v_session.redirected_at is not null then
    select count(*) into v_view_count
      from public.auto_link_view_events where auto_link_id = v_link.id;
    return jsonb_build_object('destination_url', v_link.destination_url,
      'counted', false, 'view_count', coalesce(v_view_count, 0), 'earned_amount', 0);
  end if;

  insert into public.auto_link_view_events(
    auto_link_id, owner_user_id, flow_session_id, visitor_key, view_date
  ) values (
    v_link.id, v_link.user_id, v_session.id, v_session.visitor_key, v_session.view_date
  ) on conflict (auto_link_id, visitor_key, view_date) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    select count(*) into v_view_number
      from public.auto_link_view_events where auto_link_id = v_link.id;
    v_view_count := v_view_number;
    select * into v_settings from public.auto_link_earning_settings where id = true;
    if not found then raise exception 'Pengaturan CPM belum tersedia'; end if;
    v_rate := case when v_view_number <= v_settings.early_view_limit
      then v_settings.early_rate_percent else v_settings.normal_rate_percent end;
    v_earning := floor((v_settings.cpm_amount::numeric * v_rate / 100) / 1000)::bigint;

    update public.auto_link_view_events
      set view_number = v_view_number, creator_earning = v_earning
      where id = v_event_id;
    update public.auto_links set click_count = click_count + 1, updated_at = now()
      where id = v_link.id;
    if v_earning > 0 then
      insert into public.wallet_accounts(user_id) values(v_link.user_id) on conflict(user_id) do nothing;
      update public.wallet_accounts
        set earning_balance = earning_balance + v_earning, updated_at = now()
        where user_id = v_link.user_id;
      insert into public.wallet_transactions(
        user_id, bucket, direction, amount, reference_type, reference_id, note
      ) values (
        v_link.user_id, 'earning', 'credit', v_earning,
        'auto_link_view', v_event_id,
        'Pendapatan Auto Link dari redirect valid #' || v_view_number
      );
    end if;
    v_counted := true;
  end if;

  update public.auto_link_flow_sessions set redirected_at = now() where id = v_session.id;
  if not v_counted then
    select count(*) into v_view_count
      from public.auto_link_view_events where auto_link_id = v_link.id;
  end if;
  return jsonb_build_object(
    'destination_url', v_link.destination_url,
    'counted', v_counted,
    'view_count', coalesce(v_view_count, 0),
    'earned_amount', v_earning
  );
end;
$$;

-- These RPCs are callable only by the Cloudflare Pages server using the service role.
revoke all on function public.bearn_start_auto_flow(text,text,text) from public, anon, authenticated;
revoke all on function public.bearn_complete_auto_flow_stage(text,integer) from public, anon, authenticated;
revoke all on function public.bearn_get_auto_flow_status(text) from public, anon, authenticated;
revoke all on function public.bearn_finalize_auto_flow(text) from public, anon, authenticated;
grant execute on function public.bearn_start_auto_flow(text,text,text) to service_role;
grant execute on function public.bearn_complete_auto_flow_stage(text,integer) to service_role;
grant execute on function public.bearn_get_auto_flow_status(text) to service_role;
grant execute on function public.bearn_finalize_auto_flow(text) to service_role;

-- 9) Extend dashboard metrics with successful free Auto Link redirect counts and earnings.
create or replace function public.get_dashboard_metrics()
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare v_uid uuid := auth.uid(); result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object(
    'auto_link_count', (select count(*) from public.auto_links where user_id=v_uid),
    'payment_link_count', (select count(*) from public.payment_links where user_id=v_uid),
    'payment_link_paid_count', (select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid'),
    'auto_link_paid_count', (select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid'),
    'payment_link_revenue', (select coalesce(sum(o.creator_net),0) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid'),
    'auto_link_revenue', (select coalesce(sum(o.creator_net),0) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid'),
    'auto_link_view_count', (select count(*) from public.auto_link_view_events where owner_user_id=v_uid),
    'auto_link_view_revenue', (select coalesce(sum(creator_earning),0) from public.auto_link_view_events where owner_user_id=v_uid),
    'auto_link_view_today', (select count(*) from public.auto_link_view_events where owner_user_id=v_uid and created_at::date=current_date),
    'auto_link_view_revenue_today', (select coalesce(sum(creator_earning),0) from public.auto_link_view_events where owner_user_id=v_uid and created_at::date=current_date),
    'sales_today', (
      (select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid' and o.paid_at::date=current_date)
      + (select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid' and o.paid_at::date=current_date)
    ),
    'sales_total', (
      (select count(*) from public.payment_link_orders o join public.payment_links p on p.id=o.payment_link_id where p.user_id=v_uid and o.status='paid')
      + (select count(*) from public.auto_link_orders o join public.auto_links a on a.id=o.auto_link_id where a.user_id=v_uid and o.status='paid')
    )
  ) into result;
  return result;
end;
$$;
grant execute on function public.get_dashboard_metrics() to authenticated;

-- NOTE: Existing paid Auto Link orders are kept as historical records. The new
-- Rp2,000 / Rp1,500 split applies to new order inserts; no existing wallet balance
-- is silently rewritten by this migration.
