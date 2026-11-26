-- BEARN: simpan username yang dikirim saat signUp ke tabel profiles.
-- Jalankan migration ini di Supabase SQL Editor sebelum mengaktifkan registrasi username.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(user_id, full_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(trim(new.raw_user_meta_data->>'username'), '')
  );
  insert into public.wallet_accounts(user_id)
  values(new.id)
  on conflict do nothing;
  return new;
end;
$$;
