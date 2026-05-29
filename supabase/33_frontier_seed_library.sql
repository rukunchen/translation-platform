-- =====================================================================
-- 33_frontier_seed_library.sql
-- 把 user_id is null 的前沿文献作为共享模板；用户首次进入时复制为私有副本。
-- =====================================================================

alter table public.frontier_literature_items
  add column if not exists seed_source_id uuid references public.frontier_literature_items(id) on delete set null;

create index if not exists frontier_literature_seed_source_idx
  on public.frontier_literature_items(seed_source_id);

drop index if exists public.frontier_literature_user_seed_source_unique;
create unique index frontier_literature_user_seed_source_unique
  on public.frontier_literature_items(user_id, seed_source_id);

create table if not exists public.frontier_literature_seed_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seeded_at timestamptz not null default now()
);

alter table public.frontier_literature_seed_status enable row level security;

drop policy if exists frontier_literature_seed_status_own_select on public.frontier_literature_seed_status;
create policy frontier_literature_seed_status_own_select on public.frontier_literature_seed_status
  for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.frontier_literature_seed_status to authenticated;
