-- =====================================================================
-- 26_reading_article_genre.sql
-- 深读室文章库：为文章增加体裁分类。
-- =====================================================================

alter table public.reading_articles
  add column if not exists genre text default '其他';
