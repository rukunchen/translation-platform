-- =====================================================================
-- 29_frontier_reading_sessions.sql
-- 前沿文献阅读会话与用户笔记：登录用户只能管理自己的会话和笔记。
-- =====================================================================

create table if not exists public.frontier_reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  description text,
  selected_item_ids uuid[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.frontier_reading_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.frontier_reading_sessions(id) on delete cascade,
  item_id uuid references public.frontier_literature_items(id) on delete cascade,
  user_note text,
  method_note text,
  conclusion_note text,
  critique_note text,
  literature_review_use text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists frontier_reading_sessions_user_created_idx
  on public.frontier_reading_sessions(user_id, created_at desc);

create index if not exists frontier_reading_notes_user_session_idx
  on public.frontier_reading_notes(user_id, session_id);

create index if not exists frontier_reading_notes_item_idx
  on public.frontier_reading_notes(item_id);

drop trigger if exists frontier_reading_sessions_touch on public.frontier_reading_sessions;
create trigger frontier_reading_sessions_touch
  before update on public.frontier_reading_sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists frontier_reading_notes_touch on public.frontier_reading_notes;
create trigger frontier_reading_notes_touch
  before update on public.frontier_reading_notes
  for each row execute function public.touch_updated_at();

alter table public.frontier_reading_sessions enable row level security;
alter table public.frontier_reading_notes enable row level security;

drop policy if exists frontier_reading_sessions_select_own on public.frontier_reading_sessions;
create policy frontier_reading_sessions_select_own on public.frontier_reading_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists frontier_reading_sessions_insert_own on public.frontier_reading_sessions;
create policy frontier_reading_sessions_insert_own on public.frontier_reading_sessions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists frontier_reading_sessions_update_own on public.frontier_reading_sessions;
create policy frontier_reading_sessions_update_own on public.frontier_reading_sessions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists frontier_reading_sessions_delete_own on public.frontier_reading_sessions;
create policy frontier_reading_sessions_delete_own on public.frontier_reading_sessions
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists frontier_reading_notes_select_own on public.frontier_reading_notes;
create policy frontier_reading_notes_select_own on public.frontier_reading_notes
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists frontier_reading_notes_insert_own on public.frontier_reading_notes;
create policy frontier_reading_notes_insert_own on public.frontier_reading_notes
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists frontier_reading_notes_update_own on public.frontier_reading_notes;
create policy frontier_reading_notes_update_own on public.frontier_reading_notes
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists frontier_reading_notes_delete_own on public.frontier_reading_notes;
create policy frontier_reading_notes_delete_own on public.frontier_reading_notes
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.frontier_reading_sessions to authenticated;
grant select, insert, update, delete on public.frontier_reading_notes to authenticated;
