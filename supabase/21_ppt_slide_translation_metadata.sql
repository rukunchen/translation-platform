-- =====================================================================
-- 21_ppt_slide_translation_metadata.sql
-- PPT 分页翻译项目的最小兼容字段。
-- 不改变普通翻译项目流程，PPT 特有信息统一放 metadata JSONB。
-- =====================================================================

alter table public.projects
  add column if not exists type text not null default 'standard',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.documents
  add column if not exists document_type text not null default 'standard',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.segments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists projects_type_idx
  on public.projects(type);

create index if not exists documents_document_type_idx
  on public.documents(document_type);

create index if not exists segments_metadata_idx
  on public.segments using gin (metadata);
