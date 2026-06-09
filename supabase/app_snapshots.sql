create table if not exists public.app_snapshots (
  key text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

drop policy if exists "app_snapshots_read_all" on public.app_snapshots;
create policy "app_snapshots_read_all"
on public.app_snapshots
for select
to anon, authenticated
using (true);

drop policy if exists "app_snapshots_write_all" on public.app_snapshots;
create policy "app_snapshots_write_all"
on public.app_snapshots
for all
to anon, authenticated
using (true)
with check (true);

insert into public.app_snapshots (key, snapshot)
values ('public', '{"version":2}'::jsonb)
on conflict (key) do nothing;