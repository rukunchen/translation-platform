-- =====================================================================
-- 32_frontier_literature_user_scope.sql
-- 前沿文献库改为用户私有：每个用户只读写自己的文献条目。
-- =====================================================================

alter table public.frontier_literature_items
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists frontier_literature_user_year_created_idx
  on public.frontier_literature_items(user_id, year desc, created_at desc);

drop policy if exists frontier_literature_authenticated_select on public.frontier_literature_items;
drop policy if exists frontier_literature_admin_insert on public.frontier_literature_items;
drop policy if exists frontier_literature_admin_update on public.frontier_literature_items;
drop policy if exists frontier_literature_admin_delete on public.frontier_literature_items;

drop policy if exists frontier_literature_own_select on public.frontier_literature_items;
create policy frontier_literature_own_select on public.frontier_literature_items
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists frontier_literature_own_insert on public.frontier_literature_items;
create policy frontier_literature_own_insert on public.frontier_literature_items
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists frontier_literature_own_update on public.frontier_literature_items;
create policy frontier_literature_own_update on public.frontier_literature_items
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists frontier_literature_own_delete on public.frontier_literature_items;
create policy frontier_literature_own_delete on public.frontier_literature_items
  for delete
  to authenticated
  using (user_id = auth.uid());
