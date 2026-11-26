-- BEARN MIGRATION 13: paste-ready Auto Link content and safe text rendering.
-- Run after migrations 10 and 12.
alter table public.auto_links
  add column if not exists content_text text not null default '';
alter table public.auto_links alter column destination_url drop not null;
update public.auto_links set content_text = coalesce(nullif(destination_url, ''), 'Konten Auto Link belum diisi.') where content_text = '';
alter table public.auto_links
  drop constraint if exists auto_links_content_text_length_check;
alter table public.auto_links
  add constraint auto_links_content_text_length_check
  check (char_length(content_text) between 1 and 30000);

-- Allow creators to insert/update the pasted content. Keep destination_url for
-- backward compatibility with existing links and direct external destinations.
grant insert (content_text) on public.auto_links to authenticated;
grant update (content_text) on public.auto_links to authenticated;

-- The page content is returned only after the server verifies all three tag
-- stages and finalizes the unique-view/CPM accounting in the same transaction.
create or replace function public.bearn_get_auto_content(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.auto_link_flow_sessions%rowtype;
  v_link public.auto_links%rowtype;
  v_result jsonb;
begin
  select * into v_session from public.auto_link_flow_sessions
    where token_hash = p_token_hash for update;
  if not found or v_session.expires_at <= now() then
    raise exception 'Sesi tidak valid atau kedaluwarsa';
  end if;
  select * into v_link from public.auto_links where id = v_session.auto_link_id;
  if not found or not v_link.is_published or v_link.access_mode not in ('free_tags','choice') then
    raise exception 'Auto Link tidak aktif';
  end if;
  if not (v_session.tag1_completed and v_session.tag2_completed and v_session.tag3_completed) then
    raise exception 'Semua tahap Tag harus diselesaikan terlebih dahulu';
  end if;
  v_result := public.bearn_finalize_auto_flow(p_token_hash);
  return jsonb_build_object(
    'content_text', v_link.content_text,
    'destination_url', v_link.destination_url,
    'counted', coalesce((v_result->>'counted')::boolean, false),
    'view_count', coalesce((v_result->>'view_count')::bigint, 0),
    'earned_amount', coalesce((v_result->>'earned_amount')::bigint, 0)
  );
end;
$$;
revoke all on function public.bearn_get_auto_content(text) from public, anon, authenticated;
grant execute on function public.bearn_get_auto_content(text) to service_role;
