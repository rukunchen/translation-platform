-- =====================================================================
-- 28_frontier_ai_card_fields.sql
-- 前沿文献 AI 文献卡片字段：只补充 AI 卡片生成结果与元数据。
-- =====================================================================

alter table public.frontier_literature_items
  add column if not exists research_question text,
  add column if not exists limitation_summary text,
  add column if not exists significance_summary text,
  add column if not exists literature_review_sentence text,
  add column if not exists ai_card_generated_at timestamptz,
  add column if not exists ai_card_model text;
