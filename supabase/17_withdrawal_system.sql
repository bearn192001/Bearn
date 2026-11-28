-- BEARN WITHDRAWAL SYSTEM (migration 17)
-- Extends the legacy withdraw_requests table created in migration 07.
-- All amounts are stored in IDR integer units. Jakarta business hours are enforced server-side.

create table if not exists public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method_type text not null check (method_type in ('bank','ewallet')),
  provider text not null check (char_length(trim(provider)) between 2 and 60),
  account_name text not null check (char_length(trim(account_name)) between 2 and 100),
  account_number text not null check (char_length(trim(account_number)) between 3 and 64),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payout_methods_user_idx on public.payout_methods(user_id, is_active, is_default desc);
alter table public.payout_methods enable row level security;
drop policy if exists "payout methods self read" on public.payout_methods;
drop policy if exists "payout methods self insert" on public.payout_methods;
drop policy if exists "payout methods self update" on public.payout_methods;
drop policy if exists "payout methods self delete" on public.payout_methods;
create policy "payout methods self read" on public.payout_methods for select to authenticated using (user_id = auth.uid());
create policy "payout methods self insert" on public.payout_methods for insert to authenticated with check (user_id = auth.uid());
create policy "payout methods self update" on public.payout_methods for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "payout methods self delete" on public.payout_methods for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.payout_methods to authenticated;

create or replace function public.keep_one_default_payout_method()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_default then
    update public.payout_methods
       set is_default = false, updated_at = now()
     where user_id = new.user_id and id <> new.id and is_default = true;
  end if;
  return new;
end;
$$;
drop trigger if exists payout_methods_one_default on public.payout_methods;
create trigger payout_methods_one_default
  after insert or update of is_default on public.payout_methods
  for each row execute function public.keep_one_default_payout_method();

create table if not exists public.withdrawal_settings (
  id boolean primary key default true check (id = true),
  instant_minimum bigint not null default 50000 check (instant_minimum >= 50000),
  instant_daily_limit bigint not null default 500000 check (instant_daily_limit >= 50000),
  instant_fee bigint not null default 13000 check (instant_fee >= 0),
  manual_minimum bigint not null default 100000 check (manual_minimum >= 100000),
  manual_daily_limit integer not null default 5 check (manual_daily_limit between 1 and 50),
  manual_fee bigint not null default 10000 check (manual_fee >= 0),
  tax_amount bigint not null default 0 check (tax_amount between 0 and 2500),
  opening_hour integer not null default 9 check (opening_hour between 0 and 23),
  closing_hour integer not null default 21 check (closing_hour between 1 and 24),
  timezone text not null default 'Asia/Jakarta',
  updated_at timestamptz not null default now()
);
insert into public.withdrawal_settings(id) values (true) on conflict (id) do nothing;
alter table public.withdrawal_settings enable row level security;
revoke all on public.withdrawal_settings from anon, authenticated;

create table if not exists public.withdrawal_holidays (
  holiday_date date primary key,
  name text not null,
  holiday_type text not null check (holiday_type in ('national','collective')),
  source_label text,
  source_url text,
  created_at timestamptz not null default now()
);
alter table public.withdrawal_holidays enable row level security;
drop policy if exists "withdrawal holidays authenticated read" on public.withdrawal_holidays;
drop policy if exists "withdrawal holidays admin manage" on public.withdrawal_holidays;
create policy "withdrawal holidays authenticated read" on public.withdrawal_holidays for select to authenticated using (true);
create policy "withdrawal holidays admin manage" on public.withdrawal_holidays for all to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
grant select on public.withdrawal_holidays to authenticated;
grant insert, update, delete on public.withdrawal_holidays to authenticated;

-- Official SKB 2026 dates (remaining 2026 closure dates) and 2027 national holidays + collective leave.
insert into public.withdrawal_holidays(holiday_date, name, holiday_type, source_label, source_url) values
  ('2026-12-24','Cuti Bersama Natal','collective','SKB 3 Menteri 2026','https://www.setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026'),
  ('2026-12-25','Kelahiran Yesus Kristus (Natal)','national','SKB 3 Menteri 2026','https://www.setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026'),
  ('2027-01-01','Tahun Baru 2027 Masehi','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-01-05','Isra Mikraj Nabi Muhammad SAW','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-02-05','Cuti Bersama Tahun Baru Imlek 2578 Kongzili','collective','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-02-06','Tahun Baru Imlek 2578 Kongzili','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-08','Hari Suci Nyepi (Tahun Baru Saka 1949)','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-09','Cuti Bersama Idulfitri 1448 H','collective','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-10','Idulfitri 1448 H','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-11','Idulfitri 1448 H','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-12','Cuti Bersama Idulfitri 1448 H','collective','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-15','Cuti Bersama Idulfitri 1448 H','collective','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-25','Cuti Bersama Wafat Yesus Kristus','collective','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-26','Wafat Yesus Kristus','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-03-28','Hari Kebangkitan Yesus Kristus (Paskah)','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-05-01','Hari Buruh Internasional','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-05-06','Kenaikan Yesus Kristus','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-05-17','Iduladha 1448 H','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-05-18','Cuti Bersama Iduladha 1448 H','collective','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-05-19','Cuti Bersama Waisak 2571 BE','collective','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-05-20','Hari Raya Waisak 2571 BE','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-06-01','Hari Lahir Pancasila','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-06-06','Tahun Baru Islam 1449 H','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-08-15','Maulid Nabi Muhammad SAW','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-08-17','Proklamasi Kemerdekaan RI','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-12-24','Cuti Bersama Natal','collective','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-12-25','Kelahiran Yesus Kristus (Natal)','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'),
  ('2027-12-26','Isra Mikraj Nabi Muhammad SAW','national','SKB 3 Menteri 2027','https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027')
on conflict (holiday_date) do update set name = excluded.name, holiday_type = excluded.holiday_type,
  source_label = excluded.source_label, source_url = excluded.source_url;

-- Upgrade legacy request records without losing their IDs or status history.
alter table public.withdraw_requests
  add column if not exists withdraw_type text not null default 'manual',
  add column if not exists payout_method_id uuid references public.payout_methods(id) on delete set null,
  add column if not exists destination_type text not null default 'bank',
  add column if not exists destination_provider text,
  add column if not exists provider_fee bigint not null default 0,
  add column if not exists tax_amount bigint not null default 0,
  add column if not exists net_amount bigint not null default 0,
  add column if not exists terms_accepted boolean not null default false,
  add column if not exists processed_by uuid references auth.users(id) on delete set null,
  add column if not exists processed_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.withdraw_requests
   set destination_provider = coalesce(destination_provider, destination_name),
       net_amount = case when net_amount = 0 then greatest(amount - provider_fee - tax_amount, 0) else net_amount end
 where destination_provider is null or net_amount = 0;

alter table public.withdraw_requests drop constraint if exists withdraw_requests_status_check;
alter table public.withdraw_requests add constraint withdraw_requests_status_check
  check (status in ('pending','processing','approved','returned','rejected','paid'));
alter table public.withdraw_requests drop constraint if exists withdraw_requests_withdraw_type_check;
alter table public.withdraw_requests add constraint withdraw_requests_withdraw_type_check
  check (withdraw_type in ('instant','manual'));
alter table public.withdraw_requests drop constraint if exists withdraw_requests_destination_type_check;
alter table public.withdraw_requests add constraint withdraw_requests_destination_type_check
  check (destination_type in ('bank','ewallet'));
alter table public.withdraw_requests drop constraint if exists withdraw_requests_amount_breakdown_check;
alter table public.withdraw_requests add constraint withdraw_requests_amount_breakdown_check
  check (provider_fee >= 0 and tax_amount between 0 and 2500 and net_amount >= 0 and net_amount <= amount);
create index if not exists withdraw_requests_user_created_idx on public.withdraw_requests(user_id, created_at desc);
create index if not exists withdraw_requests_admin_queue_idx on public.withdraw_requests(status, withdraw_type, created_at);

alter table public.withdraw_requests enable row level security;
drop policy if exists "withdraw self read" on public.withdraw_requests;
drop policy if exists "withdraw self insert" on public.withdraw_requests;
drop policy if exists "withdraw requests owner read" on public.withdraw_requests;
drop policy if exists "withdraw requests admin read" on public.withdraw_requests;
create policy "withdraw requests owner read" on public.withdraw_requests for select to authenticated
  using (user_id = auth.uid());
create policy "withdraw requests admin read" on public.withdraw_requests for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
revoke insert, update, delete on public.withdraw_requests from anon, authenticated;
grant select on public.withdraw_requests to authenticated;

create or replace function public.get_withdrawal_config()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.withdrawal_settings%rowtype;
  v_local timestamp;
  v_date date;
  v_day integer;
  v_hour numeric;
  v_holiday_name text;
  v_reason text := null;
  v_kind text := null;
  v_is_open boolean := false;
  v_balance bigint := 0;
  v_instant_used bigint := 0;
  v_manual_count integer := 0;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if v_uid is null then raise exception 'Silakan login untuk melihat jadwal withdraw.'; end if;
  select * into v_cfg from public.withdrawal_settings where id = true;
  v_local := now() at time zone coalesce(v_cfg.timezone, 'Asia/Jakarta');
  v_date := v_local::date;
  v_day := extract(isodow from v_local)::integer;
  v_hour := extract(hour from v_local) + extract(minute from v_local) / 60.0;
  v_day_start := v_date::timestamp at time zone coalesce(v_cfg.timezone, 'Asia/Jakarta');
  v_day_end := (v_date + 1)::timestamp at time zone coalesce(v_cfg.timezone, 'Asia/Jakarta');
  select name into v_holiday_name from public.withdrawal_holidays where holiday_date = v_date;
  select earning_balance into v_balance from public.wallet_accounts where user_id = v_uid;
  select coalesce(sum(amount),0) into v_instant_used from public.withdraw_requests
   where user_id = v_uid and withdraw_type = 'instant' and created_at >= v_day_start and created_at < v_day_end
     and status not in ('returned','rejected');
  select count(*)::integer into v_manual_count from public.withdraw_requests
   where user_id = v_uid and withdraw_type = 'manual' and created_at >= v_day_start and created_at < v_day_end
     and status not in ('returned','rejected');
  if v_holiday_name is not null then
    v_reason := 'Layanan tutup karena ' || v_holiday_name || '.'; v_kind := 'holiday';
  elsif v_day in (6,7) then
    v_reason := 'Layanan withdraw tutup pada hari Sabtu dan Minggu. Silakan kembali pada hari kerja.'; v_kind := 'weekend';
  elsif v_hour < coalesce(v_cfg.opening_hour,9) or v_hour >= coalesce(v_cfg.closing_hour,21) then
    v_reason := 'Di luar jam layanan. Withdraw buka Senin–Jumat pukul 09.00–21.00 WIB.'; v_kind := 'hours';
  else
    v_is_open := true;
  end if;
  return jsonb_build_object(
    'is_open', v_is_open, 'closed_reason', v_reason, 'closed_kind', v_kind,
    'local_date', v_date, 'local_time', to_char(v_local, 'HH24:MI'),
    'opening_hour', coalesce(v_cfg.opening_hour,9), 'closing_hour', coalesce(v_cfg.closing_hour,21),
    'instant_minimum', coalesce(v_cfg.instant_minimum,50000), 'instant_daily_limit', coalesce(v_cfg.instant_daily_limit,500000),
    'instant_fee', coalesce(v_cfg.instant_fee,13000), 'manual_minimum', coalesce(v_cfg.manual_minimum,100000),
    'manual_daily_limit', coalesce(v_cfg.manual_daily_limit,5), 'manual_fee', coalesce(v_cfg.manual_fee,10000),
    'tax_amount', coalesce(v_cfg.tax_amount,0), 'available_balance', coalesce(v_balance,0),
    'instant_daily_used', coalesce(v_instant_used,0), 'manual_daily_used', coalesce(v_manual_count,0)
  );
end;
$$;

create or replace function public.get_my_withdraw_usage()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_cfg public.withdrawal_settings%rowtype; v_date date;
  v_start timestamptz; v_end timestamptz; v_instant bigint := 0; v_manual integer := 0;
begin
  if v_uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  select * into v_cfg from public.withdrawal_settings where id = true;
  v_date := (now() at time zone coalesce(v_cfg.timezone,'Asia/Jakarta'))::date;
  v_start := v_date::timestamp at time zone coalesce(v_cfg.timezone,'Asia/Jakarta');
  v_end := (v_date + 1)::timestamp at time zone coalesce(v_cfg.timezone,'Asia/Jakarta');
  select coalesce(sum(amount),0) into v_instant from public.withdraw_requests where user_id=v_uid and withdraw_type='instant'
    and created_at >= v_start and created_at < v_end and status not in ('returned','rejected');
  select count(*)::integer into v_manual from public.withdraw_requests where user_id=v_uid and withdraw_type='manual'
    and created_at >= v_start and created_at < v_end and status not in ('returned','rejected');
  return jsonb_build_object('instant_amount',v_instant,'manual_count',v_manual);
end;
$$;

create or replace function public.submit_withdraw_request(
  p_withdraw_type text,
  p_amount bigint,
  p_payout_method_id uuid,
  p_terms_accepted boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_cfg public.withdrawal_settings%rowtype; v_method public.payout_methods%rowtype;
  v_wallet public.wallet_accounts%rowtype; v_local timestamp; v_date date; v_day integer; v_hour numeric;
  v_holiday_name text; v_day_start timestamptz; v_day_end timestamptz;
  v_fee bigint; v_tax bigint; v_net bigint; v_instant_used bigint := 0; v_manual_count integer := 0;
  v_request public.withdraw_requests%rowtype;
begin
  if v_uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if p_terms_accepted is distinct from true then raise exception 'Persetujuan ketentuan withdraw wajib dicentang.'; end if;
  if p_withdraw_type not in ('instant','manual') then raise exception 'Jenis withdraw tidak valid.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal withdraw tidak valid.'; end if;
  select * into v_cfg from public.withdrawal_settings where id = true for share;
  if not found then raise exception 'Pengaturan withdraw belum tersedia.'; end if;
  v_local := now() at time zone v_cfg.timezone; v_date := v_local::date;
  v_day := extract(isodow from v_local)::integer;
  v_hour := extract(hour from v_local) + extract(minute from v_local) / 60.0;
  select name into v_holiday_name from public.withdrawal_holidays where holiday_date = v_date;
  if v_holiday_name is not null then raise exception 'Withdraw tutup karena %.', v_holiday_name; end if;
  if v_day in (6,7) then raise exception 'Withdraw tutup pada hari Sabtu dan Minggu. Buka kembali Senin pukul 09.00 WIB.'; end if;
  if v_hour < v_cfg.opening_hour or v_hour >= v_cfg.closing_hour then raise exception 'Withdraw hanya buka Senin–Jumat pukul 09.00–21.00 WIB.'; end if;
  select * into v_method from public.payout_methods where id = p_payout_method_id and user_id = v_uid and is_active = true;
  if not found then raise exception 'Rekening tujuan tidak ditemukan. Silakan simpan rekening di Pengaturan.'; end if;
  if p_withdraw_type = 'instant' then
    if p_amount < v_cfg.instant_minimum then raise exception 'Minimal withdraw instan Rp%.', v_cfg.instant_minimum; end if;
    v_fee := v_cfg.instant_fee;
  else
    if p_amount < v_cfg.manual_minimum then raise exception 'Minimal withdraw manual Rp%.', v_cfg.manual_minimum; end if;
    v_fee := v_cfg.manual_fee;
  end if;
  v_tax := v_cfg.tax_amount;
  v_net := p_amount - v_fee - v_tax;
  if v_net <= 0 then raise exception 'Nominal bersih setelah biaya dan pajak harus lebih dari Rp0.'; end if;
  v_day_start := v_date::timestamp at time zone v_cfg.timezone;
  v_day_end := (v_date + 1)::timestamp at time zone v_cfg.timezone;

  insert into public.wallet_accounts(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_wallet from public.wallet_accounts where user_id = v_uid for update;
  if v_wallet.earning_balance < p_amount then raise exception 'Saldo penghasilan tidak mencukupi. Saldo tersedia Rp%.', v_wallet.earning_balance; end if;

  if p_withdraw_type = 'instant' then
    select coalesce(sum(amount),0) into v_instant_used from public.withdraw_requests where user_id=v_uid and withdraw_type='instant'
      and created_at >= v_day_start and created_at < v_day_end and status not in ('returned','rejected');
    if v_instant_used + p_amount > v_cfg.instant_daily_limit then
      raise exception 'Batas withdraw instan harian Rp% sudah terlampaui. Sisa limit hari ini Rp%.', v_cfg.instant_daily_limit, greatest(v_cfg.instant_daily_limit-v_instant_used,0);
    end if;
  else
    select count(*)::integer into v_manual_count from public.withdraw_requests where user_id=v_uid and withdraw_type='manual'
      and created_at >= v_day_start and created_at < v_day_end and status not in ('returned','rejected');
    if v_manual_count >= v_cfg.manual_daily_limit then raise exception 'Batas withdraw manual maksimal % kali per hari sudah tercapai.', v_cfg.manual_daily_limit; end if;
  end if;

  insert into public.withdraw_requests(
    user_id, amount, destination_name, destination_account, status, withdraw_type, payout_method_id,
    destination_type, destination_provider, provider_fee, tax_amount, net_amount, terms_accepted
  ) values (
    v_uid, p_amount, v_method.account_name, v_method.account_number, 'pending', p_withdraw_type, v_method.id,
    v_method.method_type, v_method.provider, v_fee, v_tax, v_net, true
  ) returning * into v_request;

  update public.wallet_accounts set earning_balance = earning_balance - p_amount, updated_at = now() where user_id = v_uid;
  insert into public.wallet_transactions(user_id,bucket,direction,amount,reference_type,reference_id,note)
  values(v_uid,'earning','debit',p_amount,'withdraw_request',v_request.id,
    case when p_withdraw_type='instant' then 'Pengajuan withdraw instan (prioritas)' else 'Pengajuan withdraw manual' end);

  return jsonb_build_object('id',v_request.id,'amount',v_request.amount,'provider_fee',v_request.provider_fee,
    'tax_amount',v_request.tax_amount,'net_amount',v_request.net_amount,'status',v_request.status,
    'withdraw_type',v_request.withdraw_type,'created_at',v_request.created_at);
end;
$$;

create or replace function public.admin_update_withdraw_status(
  p_request_id uuid,
  p_status text,
  p_admin_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid(); v_role text; v_request public.withdraw_requests%rowtype;
begin
  if v_admin is null then raise exception 'Login admin diperlukan.'; end if;
  select role into v_role from public.profiles where user_id = v_admin;
  if v_role is distinct from 'admin' then raise exception 'Akses ditolak. Hanya admin yang dapat memproses withdraw.'; end if;
  if p_status not in ('processing','paid','returned','rejected') then raise exception 'Status withdraw tidak valid.'; end if;
  select * into v_request from public.withdraw_requests where id = p_request_id for update;
  if not found then raise exception 'Pengajuan withdraw tidak ditemukan.'; end if;
  if v_request.status in ('paid','returned','rejected') then raise exception 'Pengajuan ini sudah selesai diproses.'; end if;
  if p_status in ('returned','rejected') then
    insert into public.wallet_accounts(user_id) values(v_request.user_id) on conflict(user_id) do nothing;
    update public.wallet_accounts set earning_balance = earning_balance + v_request.amount, updated_at = now()
      where user_id = v_request.user_id;
    insert into public.wallet_transactions(user_id,bucket,direction,amount,reference_type,reference_id,note)
    values(v_request.user_id,'earning','credit',v_request.amount,'withdraw_refund',v_request.id,
      coalesce(nullif(trim(p_admin_note),''),'Dana withdraw dikembalikan oleh admin'));
  end if;
  update public.withdraw_requests set status=p_status, admin_note=nullif(trim(p_admin_note),''),
    processed_by=v_admin, processed_at=now(), paid_at=case when p_status='paid' then now() else paid_at end, updated_at=now()
    where id=p_request_id returning * into v_request;
  return jsonb_build_object('id',v_request.id,'status',v_request.status,'admin_note',v_request.admin_note,
    'processed_at',v_request.processed_at,'paid_at',v_request.paid_at);
end;
$$;

create or replace function public.admin_set_withdraw_tax(p_tax_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin uuid := auth.uid(); v_role text;
begin
  if v_admin is null then raise exception 'Login admin diperlukan.'; end if;
  select role into v_role from public.profiles where user_id=v_admin;
  if v_role is distinct from 'admin' then raise exception 'Akses ditolak.'; end if;
  if p_tax_amount is null or p_tax_amount < 0 or p_tax_amount > 2500 then raise exception 'Pajak harus antara Rp0 sampai Rp2.500.'; end if;
  update public.withdrawal_settings set tax_amount=p_tax_amount, updated_at=now() where id=true;
  return jsonb_build_object('tax_amount',p_tax_amount);
end;
$$;

revoke all on function public.get_withdrawal_config() from public;
revoke all on function public.get_my_withdraw_usage() from public;
revoke all on function public.submit_withdraw_request(text,bigint,uuid,boolean) from public;
revoke all on function public.admin_update_withdraw_status(uuid,text,text) from public;
revoke all on function public.admin_set_withdraw_tax(bigint) from public;
grant execute on function public.get_withdrawal_config() to authenticated;
grant execute on function public.get_my_withdraw_usage() to authenticated;
grant execute on function public.submit_withdraw_request(text,bigint,uuid,boolean) to authenticated;
grant execute on function public.admin_update_withdraw_status(uuid,text,text) to authenticated;
grant execute on function public.admin_set_withdraw_tax(bigint) to authenticated;
