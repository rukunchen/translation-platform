-- 给 documents 加 updated_at；该字段会在文档本身被改 / 句段被增删改时自动更新
alter table public.documents
  add column if not exists updated_at timestamptz not null default now();

-- 1) documents 自身被 UPDATE 时
create or replace function public.documents_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.documents_set_updated_at();

-- 2) 任意 segment 改动 → 同步刷新对应 document 的 updated_at
create or replace function public.touch_parent_document()
returns trigger language plpgsql as $$
declare
  doc_id uuid;
begin
  doc_id := coalesce(new.document_id, old.document_id);
  if doc_id is not null then
    update public.documents set updated_at = now() where id = doc_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_segments_touch_doc on public.segments;
create trigger trg_segments_touch_doc
  after insert or update or delete on public.segments
  for each row execute function public.touch_parent_document();

-- 把已存在文档的 updated_at 回填为该文档下最新句段时间（如果有），否则保持等于 created_at
update public.documents d
set updated_at = coalesce(
  (select max(s.updated_at) from public.segments s where s.document_id = d.id),
  d.created_at
);

create index if not exists idx_documents_updated_at on public.documents(project_id, updated_at desc);
