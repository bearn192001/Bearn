-- BEARN Auto Link paid-direct checkout via Cashi QRIS Utama.
-- Apply this migration in Supabase SQL Editor before deploying the new Pages Functions.
-- QRIS provider request omits kode_channel so Cashi selects its default QRIS Utama route.

alter table public.auto_link_orders
  add column if not exists platform_fee bigint not null default 1500 check (platform_fee >= 0);

alter table public.auto_link_orders
  add column if not exists provider_merchant_reference text unique;

alter table public.auto_link_orders
  alter column creator_net set default 2000;

-- New Auto Link direct purchases always settle as Rp3,500 gross:
-- Rp2,000 creator earning + Rp1,500 BEARN platform fee.
create or replace function public.set_bearn_auto_link_order_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.gross_amount := 3500;
  new.platform_fee := 1500;
  new.creator_net := 2000;
  if new.provider is null then new.provider := 'CASHI'; end if;
  return new;
end;
$$;

drop trigger if exists set_bearn_auto_link_order_amounts_before_insert on public.auto_link_orders;
create trigger set_bearn_auto_link_order_amounts_before_insert
before insert on public.auto_link_orders
for each row execute function public.set_bearn_auto_link_order_amounts();

-- Service-role-only payment writes. The existing credit_paid_link_order trigger
-- credits creator_net exactly once when status changes from pending to paid.
grant select, insert, update on public.auto_link_orders to service_role;

create index if not exists auto_link_orders_provider_reference_idx
  on public.auto_link_orders(provider_reference)
  where provider_reference is not null;
