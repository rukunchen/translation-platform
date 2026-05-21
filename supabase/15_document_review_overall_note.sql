-- =====================================================================
-- 15_document_review_overall_note.sql
-- 文档审校模式：章节级“审校原则和整体意见”
-- =====================================================================

alter table public.documents
  add column if not exists review_overall_note text not null default '';
