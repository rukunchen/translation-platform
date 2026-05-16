-- =====================================================================
-- Base schema for project/document/glossary tables
-- ---------------------------------------------------------------------
-- This migration creates only the app-used base tables that are missing
-- from the existing historical migrations:
--   - public.projects
--   - public.documents
--   - public.glossary_terms
--
-- Keep created_by as uuid without a profiles foreign key here so this
-- migration can run before 02_create_profiles.sql in an empty database.
-- RLS policies are intentionally left to 06_rls_policies.sql.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_created_by_idx
  on public.projects(created_by);

create index if not exists projects_created_at_idx
  on public.projects(created_at desc);

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  title           text not null,
  source_text     text not null default '',
  source_language text not null,
  target_language text not null,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Compatibility column for 04_migrate_segments_to_table.sql.
  -- 04 reads this JSONB column and then drops it after migrating rows
  -- into public.segments.
  segments        jsonb not null default '[]'::jsonb
);

create index if not exists documents_project_idx
  on public.documents(project_id);

create index if not exists documents_created_by_idx
  on public.documents(created_by);

create index if not exists documents_project_created_idx
  on public.documents(project_id, created_at desc);

create index if not exists documents_segments_idx
  on public.documents using gin (segments);

-- ---------------------------------------------------------------------
-- glossary_terms
-- ---------------------------------------------------------------------
create table if not exists public.glossary_terms (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  source_term     text not null,
  translated_term text not null,
  definition      text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  category        text not null default '',
  note            text not null default '',
  status          text not null default 'active',
  is_questionable boolean not null default false,
  match_status    text not null default 'unknown'
);

create index if not exists idx_glossary_project
  on public.glossary_terms(project_id);

create index if not exists glossary_terms_created_by_idx
  on public.glossary_terms(created_by);

create index if not exists glossary_terms_project_created_idx
  on public.glossary_terms(project_id, created_at desc);

create index if not exists idx_glossary_match
  on public.glossary_terms(project_id, match_status);

create unique index if not exists ux_glossary_project_source_term
  on public.glossary_terms(project_id, lower(source_term));
