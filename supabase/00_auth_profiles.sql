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
