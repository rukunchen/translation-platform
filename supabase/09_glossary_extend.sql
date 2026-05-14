-- 术语库扩展：补齐管理所需字段
alter table public.glossary_terms
  add column if not exists category        text    not null default '',
  add column if not exists note            text    not null default '',
  add column if not exists status          text    not null default 'active',
  add column if not exists is_questionable boolean not null default false,
  add column if not exists match_status    text    not null default 'unknown',
  add column if not exists updated_at      timestamptz not null default now();

-- 触发器：自动更新 updated_at
create or replace function public.glossary_terms_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_glossary_updated_at on public.glossary_terms;
create trigger trg_glossary_updated_at
  before update on public.glossary_terms
  for each row execute function public.glossary_terms_set_updated_at();

-- 查询索引
create index if not exists idx_glossary_project on public.glossary_terms(project_id);
create index if not exists idx_glossary_match   on public.glossary_terms(project_id, match_status);

-- 去重唯一约束：同一项目下，原文术语不可重复（不区分大小写）
create unique index if not exists ux_glossary_project_source_term
  on public.glossary_terms(project_id, lower(source_term));
