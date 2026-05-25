-- =====================================================================
-- 25_reading_room.sql
-- 深读室 MVP：保存手动导入文章与选文笔记。
-- =====================================================================

create table if not exists public.reading_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  source text,
  source_type text default 'plain_text',
  clean_text text,
  structured_blocks jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.reading_notes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.reading_articles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_text text,
  paragraph_context text,
  ai_explanation text,
  user_note text,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists reading_articles_user_updated_idx
  on public.reading_articles(user_id, updated_at desc);

create index if not exists reading_notes_article_created_idx
  on public.reading_notes(article_id, created_at desc);

create index if not exists reading_notes_user_updated_idx
  on public.reading_notes(user_id, updated_at desc);

drop trigger if exists reading_articles_touch on public.reading_articles;
create trigger reading_articles_touch
  before update on public.reading_articles
  for each row execute function public.touch_updated_at();

drop trigger if exists reading_notes_touch on public.reading_notes;
create trigger reading_notes_touch
  before update on public.reading_notes
  for each row execute function public.touch_updated_at();

alter table public.reading_articles enable row level security;
alter table public.reading_notes enable row level security;

drop policy if exists reading_articles_own_select on public.reading_articles;
create policy reading_articles_own_select on public.reading_articles
  for select using (user_id = auth.uid());

drop policy if exists reading_articles_own_insert on public.reading_articles;
create policy reading_articles_own_insert on public.reading_articles
  for insert with check (user_id = auth.uid());

drop policy if exists reading_articles_own_update on public.reading_articles;
create policy reading_articles_own_update on public.reading_articles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reading_articles_own_delete on public.reading_articles;
create policy reading_articles_own_delete on public.reading_articles
  for delete using (user_id = auth.uid());

drop policy if exists reading_notes_own_select on public.reading_notes;
create policy reading_notes_own_select on public.reading_notes
  for select using (user_id = auth.uid());

drop policy if exists reading_notes_own_insert on public.reading_notes;
create policy reading_notes_own_insert on public.reading_notes
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.reading_articles article
      where article.id = article_id
        and article.user_id = auth.uid()
    )
  );

drop policy if exists reading_notes_own_update on public.reading_notes;
create policy reading_notes_own_update on public.reading_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reading_notes_own_delete on public.reading_notes;
create policy reading_notes_own_delete on public.reading_notes
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.reading_articles to authenticated;
grant select, insert, update, delete on public.reading_notes to authenticated;
