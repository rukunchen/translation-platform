-- =====================================================================
-- 31_frontier_subscriptions_candidates.sql
-- 前沿文献领域订阅与候选文献池。
-- =====================================================================

create table if not exists public.frontier_field_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  region text default '全部',
  keywords text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.frontier_literature_candidates (
  id uuid primary key default gen_random_uuid(),
  source_api text,
  title text,
  authors text,
  year int,
  source text,
  region text,
  field text,
  abstract text,
  doi text,
  url text,
  tags text[],
  status text default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'imported', 'duplicate')),
  imported_item_id uuid references public.frontier_literature_items(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists frontier_field_subscriptions_user_active_idx
  on public.frontier_field_subscriptions(user_id, is_active);

create index if not exists frontier_literature_candidates_status_created_idx
  on public.frontier_literature_candidates(status, created_at desc);

create index if not exists frontier_literature_candidates_field_created_idx
  on public.frontier_literature_candidates(field, created_at desc);

drop trigger if exists frontier_field_subscriptions_touch on public.frontier_field_subscriptions;
create trigger frontier_field_subscriptions_touch
  before update on public.frontier_field_subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists frontier_literature_candidates_touch on public.frontier_literature_candidates;
create trigger frontier_literature_candidates_touch
  before update on public.frontier_literature_candidates
  for each row execute function public.touch_updated_at();

alter table public.frontier_field_subscriptions enable row level security;
alter table public.frontier_literature_candidates enable row level security;

drop policy if exists frontier_field_subscriptions_own_select on public.frontier_field_subscriptions;
create policy frontier_field_subscriptions_own_select on public.frontier_field_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists frontier_field_subscriptions_own_insert on public.frontier_field_subscriptions;
create policy frontier_field_subscriptions_own_insert on public.frontier_field_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists frontier_field_subscriptions_own_update on public.frontier_field_subscriptions;
create policy frontier_field_subscriptions_own_update on public.frontier_field_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists frontier_field_subscriptions_own_delete on public.frontier_field_subscriptions;
create policy frontier_field_subscriptions_own_delete on public.frontier_field_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists frontier_literature_candidates_authenticated_select on public.frontier_literature_candidates;
create policy frontier_literature_candidates_authenticated_select on public.frontier_literature_candidates
  for select
  to authenticated
  using (true);

drop policy if exists frontier_literature_candidates_admin_insert on public.frontier_literature_candidates;
create policy frontier_literature_candidates_admin_insert on public.frontier_literature_candidates
  for insert
  to authenticated
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists frontier_literature_candidates_admin_update on public.frontier_literature_candidates;
create policy frontier_literature_candidates_admin_update on public.frontier_literature_candidates
  for update
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists frontier_literature_candidates_admin_delete on public.frontier_literature_candidates;
create policy frontier_literature_candidates_admin_delete on public.frontier_literature_candidates
  for delete
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

grant select, insert, update, delete on public.frontier_field_subscriptions to authenticated;
grant select, insert, update, delete on public.frontier_literature_candidates to authenticated;
