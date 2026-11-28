-- BEARN GO: managed endorse creatives for the three public Go page placements.
-- Admin panel can manage rows directly through Supabase using the authenticated admin role.

create table if not exists public.go_endorse_slots (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null unique check (slot_key in ('top','middle','bottom')),
  title text,
  image_url text not null check (image_url ~* '^https://'),
  target_url text not null check (target_url ~* '^https?://'),
  alt_text text,
  is_active boolean not null default false,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint go_endorse_valid_schedule check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists go_endorse_slots_active_order_idx
  on public.go_endorse_slots (is_active, sort_order, slot_key);

alter table public.go_endorse_slots enable row level security;

drop policy if exists "go endorse public active read" on public.go_endorse_slots;
create policy "go endorse public active read"
  on public.go_endorse_slots for select to anon, authenticated
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

drop policy if exists "go endorse admin read all" on public.go_endorse_slots;
create policy "go endorse admin read all"
  on public.go_endorse_slots for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "go endorse admin insert" on public.go_endorse_slots;
create policy "go endorse admin insert"
  on public.go_endorse_slots for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "go endorse admin update" on public.go_endorse_slots;
create policy "go endorse admin update"
  on public.go_endorse_slots for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "go endorse admin delete" on public.go_endorse_slots;
create policy "go endorse admin delete"
  on public.go_endorse_slots for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

grant select on public.go_endorse_slots to anon, authenticated;
grant insert, update, delete on public.go_endorse_slots to authenticated;
