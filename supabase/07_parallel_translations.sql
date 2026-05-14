-- =====================================================================
-- 07_parallel_translations.sql
-- 多模型并行翻译候选结果表
-- 设计：同一 segment + provider + model 唯一（再次翻译会覆盖）
-- 关系：parallel_translations.segment_id → segments.id
--      用户"采用"某条候选时把它的 translated_text 写回 segments.target
-- =====================================================================

create table if not exists public.parallel_translations (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents(id) on delete cascade,
  segment_id      uuid not null references public.segments(id) on delete cascade,
  -- 模型配置
  provider        text not null,
  model           text not null,
  temperature     numeric(3,2) not null default 0.30
                  check (temperature >= 0 and temperature <= 2),
  prompt          text,
  -- 翻译数据
  source_text     text not null,
  translated_text text default '',
  -- 状态机
  status          text not null default 'pending'
                  check (status in ('pending','running','success','failed')),
  error_message   text,
  -- 元信息
  created_by      uuid references public.profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  -- 唯一约束：同一 segment 在 (provider, model) 维度只保留一条
  unique (segment_id, provider, model)
);

create index if not exists pt_document_idx on public.parallel_translations(document_id);
create index if not exists pt_segment_idx on public.parallel_translations(segment_id);
create index if not exists pt_doc_provider_model_idx
  on public.parallel_translations(document_id, provider, model);

-- 触发器：updated_at 自动维护
drop trigger if exists pt_touch on public.parallel_translations;
create trigger pt_touch
  before update on public.parallel_translations
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RLS：和 segments 同样的项目成员模式
-- 规则：
--   · SELECT / INSERT / UPDATE：所有项目成员
--   · DELETE：仅 manager
-- =====================================================================
alter table public.parallel_translations enable row level security;

drop policy if exists pt_select on public.parallel_translations;
create policy pt_select on public.parallel_translations
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = parallel_translations.document_id
        and public.is_project_member(d.project_id)
    )
  );

drop policy if exists pt_insert on public.parallel_translations;
create policy pt_insert on public.parallel_translations
  for insert with check (
    exists (
      select 1 from public.documents d
      where d.id = parallel_translations.document_id
        and public.is_project_member(d.project_id)
    )
  );

drop policy if exists pt_update on public.parallel_translations;
create policy pt_update on public.parallel_translations
  for update using (
    exists (
      select 1 from public.documents d
      where d.id = parallel_translations.document_id
        and public.is_project_member(d.project_id)
    )
  );

drop policy if exists pt_delete on public.parallel_translations;
create policy pt_delete on public.parallel_translations
  for delete using (
    exists (
      select 1 from public.documents d
      where d.id = parallel_translations.document_id
        and public.is_project_manager(d.project_id)
    )
  );
