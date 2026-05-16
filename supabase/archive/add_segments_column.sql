-- 为 documents 表添加 segments 列，存储分句结果
-- 结构：[{ "id": "uuid", "source": "原文句", "target": "译文句" }, ...]
-- 在 Supabase Dashboard → SQL Editor 中执行：

alter table public.documents
  add column if not exists segments jsonb default '[]'::jsonb;

create index if not exists documents_segments_idx
  on public.documents using gin (segments);
