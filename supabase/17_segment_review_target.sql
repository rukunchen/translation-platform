-- =====================================================================
-- 17_segment_review_target.sql
-- 审校模式：审校译文独立字段，避免覆盖译者译文
-- =====================================================================

alter table public.segments
  add column if not exists translator_target text not null default '',
  add column if not exists review_target text not null default '';

update public.segments
set translator_target = target
where coalesce(translator_target, '') = ''
  and coalesce(target, '') <> '';

update public.segments
set review_target = target
where coalesce(review_target, '') = ''
  and coalesce(target, '') <> '';
