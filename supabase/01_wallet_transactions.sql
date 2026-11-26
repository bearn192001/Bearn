-- WALLET: topup and creator earnings are separate buckets.
create table if not exists public.wallet_accounts(user_id uuid primary key references auth.users(id) on delete cascade, topup_balance bigint not null default 0 check(topup_balance>=0), earning_balance bigint not null default 0 check(earning_balance>=0), updated_at timestamptz not null default now());
create table if not exists public.wallet_transactions(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, bucket text not null check(bucket in ('topup','earning')), direction text not null check(direction in ('credit','debit')), amount bigint not null check(amount>0), reference_type text, reference_id uuid, note text, created_at timestamptz not null default now());
alter table public.wallet_accounts enable row level security; alter table public.wallet_transactions enable row level security;
create policy "wallet read self" on public.wallet_accounts for select to authenticated using(user_id=auth.uid()); create policy "transactions read self" on public.wallet_transactions for select to authenticated using(user_id=auth.uid());

-- Create the profile + wallet row automatically for new Supabase Auth users.
drop trigger if exists on_auth_user_created_bearn on auth.users;
create trigger on_auth_user_created_bearn after insert on auth.users for each row execute function public.handle_new_user();
