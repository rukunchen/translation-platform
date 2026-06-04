-- =====================================================================
-- 43_mindmaps.sql
-- 独立思维导图 MVP：每个用户只能管理自己的导图。
-- 第一阶段仅保存树形 JSON，不包含多人协作、拖拽坐标或 AI 生成。
-- =====================================================================

create table if not exists public.mindmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '未命名导图',
  description text,
  content_json jsonb not null,
  source_module text default 'manual',
  source_entity_id uuid,
  visibility text default 'private',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists mindmaps_user_idx
  on public.mindmaps(user_id);

create index if not exists mindmaps_created_at_idx
  on public.mindmaps(created_at desc);

create index if not exists mindmaps_updated_at_idx
  on public.mindmaps(updated_at desc);

create index if not exists mindmaps_source_module_idx
  on public.mindmaps(source_module);

create index if not exists mindmaps_user_updated_idx
  on public.mindmaps(user_id, updated_at desc);

drop trigger if exists mindmaps_touch on public.mindmaps;
create trigger mindmaps_touch
  before update on public.mindmaps
  for each row execute function public.touch_updated_at();

alter table public.mindmaps enable row level security;

drop policy if exists mindmaps_own_select on public.mindmaps;
create policy mindmaps_own_select on public.mindmaps
  for select using (user_id = auth.uid());

drop policy if exists mindmaps_own_insert on public.mindmaps;
create policy mindmaps_own_insert on public.mindmaps
  for insert with check (user_id = auth.uid());

drop policy if exists mindmaps_own_update on public.mindmaps;
create policy mindmaps_own_update on public.mindmaps
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists mindmaps_own_delete on public.mindmaps;
create policy mindmaps_own_delete on public.mindmaps
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.mindmaps to authenticated;
