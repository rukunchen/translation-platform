-- =====================================================================
-- 42_reading_annotations.sql
-- 深读室阅读标注：保存下划线与高亮标注。
-- =====================================================================

create table if not exists public.reading_annotations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.reading_articles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  quote text not null,
  start_offset integer not null,
  end_offset integer not null,
  annotation_type text not null default 'highlight',
  color text default 'yellow',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint reading_annotations_offsets_check check (start_offset >= 0 and end_offset > start_offset),
  constraint reading_annotations_type_check check (annotation_type in ('highlight', 'underline')),
  constraint reading_annotations_color_check check (color in ('yellow', 'green', 'blue', 'purple', 'red', 'gray'))
);

create index if not exists reading_annotations_article_idx
  on public.reading_annotations(article_id);

create index if not exists reading_annotations_user_idx
  on public.reading_annotations(user_id);

create index if not exists reading_annotations_article_user_idx
  on public.reading_annotations(article_id, user_id);

create index if not exists reading_annotations_article_offsets_idx
  on public.reading_annotations(article_id, start_offset, end_offset);

drop trigger if exists reading_annotations_touch on public.reading_annotations;
create trigger reading_annotations_touch
  before update on public.reading_annotations
  for each row execute function public.touch_updated_at();

alter table public.reading_annotations enable row level security;

drop policy if exists reading_annotations_own_select on public.reading_annotations;
create policy reading_annotations_own_select on public.reading_annotations
  for select using (user_id = auth.uid());

drop policy if exists reading_annotations_own_insert on public.reading_annotations;
create policy reading_annotations_own_insert on public.reading_annotations
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.reading_articles article
      where article.id = article_id
        and article.user_id = auth.uid()
    )
  );

drop policy if exists reading_annotations_own_update on public.reading_annotations;
create policy reading_annotations_own_update on public.reading_annotations
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.reading_articles article
      where article.id = article_id
        and article.user_id = auth.uid()
    )
  );

drop policy if exists reading_annotations_own_delete on public.reading_annotations;
create policy reading_annotations_own_delete on public.reading_annotations
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.reading_annotations to authenticated;
