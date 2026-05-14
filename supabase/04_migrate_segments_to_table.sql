-- =====================================================================
-- 04_migrate_segments_to_table.sql
-- 把 documents.segments JSONB 列拆成独立 segments 表
-- 含数据迁移 + 删除旧 JSONB 列
-- =====================================================================

-- ① 建表
create table if not exists public.segments (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  position      int not null,                       -- 在文档中的顺序，从 0 开始
  source        text not null,
  target        text not null default '',
  status        text not null default 'untranslated'
                check (status in ('untranslated','draft','reviewed','locked')),
  -- 审校信息
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  -- 最终确认信息（manager 锁定）
  locked_by     uuid references public.profiles(id),
  locked_at     timestamptz,
  -- 谁最后改了译文（用于显示"由 X 翻译"）
  last_edited_by uuid references public.profiles(id),
  -- 时间戳
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  unique (document_id, position)
);

create index if not exists segments_document_idx on public.segments(document_id);
create index if not exists segments_status_idx on public.segments(document_id, status);
create index if not exists segments_locked_idx on public.segments(locked_by) where locked_by is not null;

-- ② 触发器：updated_at 自动更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists segments_touch on public.segments;
create trigger segments_touch
  before update on public.segments
  for each row execute function public.touch_updated_at();

-- ③ 一次性数据迁移：把 documents.segments JSONB 拆到 segments 表
-- 兼容老数据结构 { id, source, target }
do $$
declare
  doc record;
  seg jsonb;
  pos int;
  inferred_status text;
begin
  for doc in
    select id, segments
    from public.documents
    where segments is not null
      and jsonb_array_length(coalesce(segments, '[]'::jsonb)) > 0
  loop
    pos := 0;
    for seg in select * from jsonb_array_elements(doc.segments)
    loop
      -- 根据 target 推断初始 status
      inferred_status := case
        when coalesce(seg->>'target','') = '' then 'untranslated'
        else 'draft'
      end;

      insert into public.segments (document_id, position, source, target, status)
      values (
        doc.id,
        pos,
        coalesce(seg->>'source', ''),
        coalesce(seg->>'target', ''),
        inferred_status
      )
      on conflict (document_id, position) do nothing;

      pos := pos + 1;
    end loop;
  end loop;
end $$;

-- ④ 删除旧 JSONB 列（迁移完才能删）
-- ⚠️ 确认上面迁移成功后再执行这一句；不放心可以先注释掉这一行单跑前 3 步
alter table public.documents drop column if exists segments;
