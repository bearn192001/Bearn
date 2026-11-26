-- Extend Auto Link access modes and optional password protection.
-- Run this migration in the Supabase SQL editor before deploying the updated site.
alter table public.auto_links
  drop constraint if exists auto_links_access_mode_check;
alter table public.auto_links
  add column if not exists password_enabled boolean not null default false,
  add column if not exists password_salt text,
  add column if not exists password_hash text;

alter table public.auto_links
  add constraint auto_links_access_mode_check
  check (access_mode in ('instant','free_tags','paid_direct','choice'));

alter table public.auto_links
  add constraint auto_links_password_record_check
  check (
    (password_enabled = false and password_salt is null and password_hash is null)
    or
    (password_enabled = true and password_salt is not null and password_hash is not null and password_salt ~ '^[a-f0-9]{32}$' and password_hash ~ '^[a-f0-9]{64}$')
  );

-- Preserve the existing column-level permissions and add creator insert access
-- only for the new password metadata. Password hashes are not granted to clients.
grant insert (password_enabled, password_salt, password_hash) on public.auto_links to authenticated;

-- Allow the combined mode to use the same server-verified tag flow.
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
