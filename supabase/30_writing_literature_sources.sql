-- =====================================================================
-- 30_writing_literature_sources.sql
-- 论文写作素材：把前沿文献保存到指定论文项目。
-- =====================================================================

create table if not exists public.writing_literature_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  writing_project_id uuid not null references public.writing_projects(id) on delete cascade,
  frontier_item_id uuid references public.frontier_literature_items(id) on delete set null,
  title text,
  authors text,
  year int,
  source text,
  doi text,
  url text,
  field text,
  method_summary text,
  conclusion_summary text,
  limitation_summary text,
  literature_review_sentence text,
  user_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists writing_literature_sources_user_created_idx
  on public.writing_literature_sources(user_id, created_at desc);

create index if not exists writing_literature_sources_project_created_idx
  on public.writing_literature_sources(writing_project_id, created_at desc);

create unique index if not exists writing_literature_sources_project_frontier_unique
  on public.writing_literature_sources(writing_project_id, frontier_item_id)
  where frontier_item_id is not null;

drop trigger if exists writing_literature_sources_touch on public.writing_literature_sources;
create trigger writing_literature_sources_touch
  before update on public.writing_literature_sources
  for each row execute function public.touch_updated_at();

alter table public.writing_literature_sources enable row level security;

drop policy if exists writing_literature_sources_own_select on public.writing_literature_sources;
create policy writing_literature_sources_own_select on public.writing_literature_sources
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists writing_literature_sources_own_insert on public.writing_literature_sources;
create policy writing_literature_sources_own_insert on public.writing_literature_sources
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.writing_projects project
      where project.id = writing_project_id
        and project.user_id = auth.uid()
    )
  );

drop policy if exists writing_literature_sources_own_update on public.writing_literature_sources;
create policy writing_literature_sources_own_update on public.writing_literature_sources
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.writing_projects project
      where project.id = writing_project_id
        and project.user_id = auth.uid()
    )
  );

drop policy if exists writing_literature_sources_own_delete on public.writing_literature_sources;
create policy writing_literature_sources_own_delete on public.writing_literature_sources
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.writing_literature_sources to authenticated;
