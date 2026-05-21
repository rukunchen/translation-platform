-- =====================================================================
-- 16_segment_translator_target_snapshot.sql
-- 审校模式：保留译者初稿，用于和审校译文对照
-- =====================================================================

alter table public.segments
  add column if not exists translator_target text not null default '';

update public.segments
set translator_target = target
where coalesce(translator_target, '') = ''
  and coalesce(target, '') <> '';
