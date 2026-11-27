-- AUTO LINK. The destination is only used by the controlled redirect endpoint.
create table if not exists public.auto_links(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, slug text not null unique, destination_url text not null, is_published boolean not null default false, click_count bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint auto_links_https check(destination_url ~ '^https?://'));
alter table public.auto_links enable row level security; create policy "auto links public read published" on public.auto_links for select using(is_published=true or auth.uid()=user_id); create policy "auto links owner insert" on public.auto_links for insert to authenticated with check(user_id=auth.uid()); create policy "auto links owner update" on public.auto_links for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); create policy "auto links owner delete" on public.auto_links for delete to authenticated using(user_id=auth.uid());


-- Server-side Auto Link API privileges.
grant select, insert, update, delete on table public.auto_links to service_role;
