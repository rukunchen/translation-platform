-- =====================================================================
-- 20_research_library.sql
-- Lightweight literature library for the writing workshop.
-- =====================================================================

create table if not exists public.research_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  authors text not null default '',
  year text not null default '',
  source_title text not null default '',
  publication_type text not null default 'article',
  doi text not null default '',
  url text not null default '',
  abstract text not null default '',
  keywords text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  reading_status text not null default 'unread'
    check (reading_status in ('unread','reading','read','excerpted')),
  file_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.research_library_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.research_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.research_collections(id) on delete cascade,
  item_id uuid not null references public.research_library_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(collection_id, item_id)
);

create table if not exists public.research_notes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.research_library_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note_type text not null default '我的评论',
  content text not null default '',
  page_number integer,
  selected_text text not null default '',
  related_writing_project_id uuid references public.writing_projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.writing_citations (
  id uuid primary key default gen_random_uuid(),
  writing_project_id uuid not null references public.writing_projects(id) on delete cascade,
  section_id uuid references public.writing_sections(id) on delete set null,
  library_item_id uuid not null references public.research_library_items(id) on delete cascade,
  citation_style text not null default 'apa',
  citation_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists research_items_user_updated_idx
  on public.research_library_items(user_id, updated_at desc);
create index if not exists research_notes_item_created_idx
  on public.research_notes(item_id, created_at desc);
create index if not exists writing_citations_project_idx
  on public.writing_citations(writing_project_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-pdfs',
  'research-pdfs',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.research_library_items enable row level security;
alter table public.research_collections enable row level security;
alter table public.research_collection_items enable row level security;
alter table public.research_notes enable row level security;
alter table public.writing_citations enable row level security;

drop policy if exists research_items_own_select on public.research_library_items;
create policy research_items_own_select on public.research_library_items
  for select using (user_id = auth.uid());
drop policy if exists research_items_own_insert on public.research_library_items;
create policy research_items_own_insert on public.research_library_items
  for insert with check (user_id = auth.uid());
drop policy if exists research_items_own_update on public.research_library_items;
create policy research_items_own_update on public.research_library_items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists research_items_own_delete on public.research_library_items;
create policy research_items_own_delete on public.research_library_items
  for delete using (user_id = auth.uid());

drop policy if exists research_collections_own_all on public.research_collections;
create policy research_collections_own_all on public.research_collections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists research_collection_items_own_all on public.research_collection_items;
create policy research_collection_items_own_all on public.research_collection_items
  for all using (
    exists (select 1 from public.research_collections c where c.id = collection_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.research_collections c where c.id = collection_id and c.user_id = auth.uid())
    and exists (select 1 from public.research_library_items i where i.id = item_id and i.user_id = auth.uid())
  );

drop policy if exists research_notes_own_select on public.research_notes;
create policy research_notes_own_select on public.research_notes
  for select using (user_id = auth.uid());
drop policy if exists research_notes_own_insert on public.research_notes;
create policy research_notes_own_insert on public.research_notes
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.research_library_items i where i.id = item_id and i.user_id = auth.uid())
  );
drop policy if exists research_notes_own_update on public.research_notes;
create policy research_notes_own_update on public.research_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists research_notes_own_delete on public.research_notes;
create policy research_notes_own_delete on public.research_notes
  for delete using (user_id = auth.uid());

drop policy if exists writing_citations_own_select on public.writing_citations;
create policy writing_citations_own_select on public.writing_citations
  for select using (
    exists (select 1 from public.writing_projects p where p.id = writing_project_id and p.user_id = auth.uid())
  );
drop policy if exists writing_citations_own_insert on public.writing_citations;
create policy writing_citations_own_insert on public.writing_citations
  for insert with check (
    exists (select 1 from public.writing_projects p where p.id = writing_project_id and p.user_id = auth.uid())
    and exists (select 1 from public.research_library_items i where i.id = library_item_id and i.user_id = auth.uid())
  );
