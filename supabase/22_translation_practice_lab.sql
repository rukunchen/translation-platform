-- =====================================================================
-- 22_translation_practice_lab.sql
-- 译训库 MVP：个人翻译练习、句段复盘、表达卡片与复习记录
-- =====================================================================

create table if not exists public.translation_practice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  direction text not null default 'E-C'
    check (direction in ('E-C', 'C-E', 'custom')),
  exam_type text not null default '课程练习',
  text_type text not null default '其他',
  difficulty integer not null default 3 check (difficulty between 1 and 5),
  source_text text not null default '',
  reference_translation text not null default '',
  my_translation text not null default '',
  ai_translation text not null default '',
  status text not null default 'unpracticed'
    check (status in ('unpracticed', 'drafted', 'compared', 'review_due', 'mastered')),
  tags text[] not null default '{}'::text[],
  source_note text not null default '',
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.translation_practice_segments (
  id uuid primary key default gen_random_uuid(),
  practice_item_id uuid not null references public.translation_practice_items(id) on delete cascade,
  segment_order integer not null,
  source_text text not null default '',
  my_translation text not null default '',
  reference_translation text not null default '',
  ai_translation text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_item_id, segment_order)
);

create table if not exists public.translation_practice_issues (
  id uuid primary key default gen_random_uuid(),
  practice_item_id uuid not null references public.translation_practice_items(id) on delete cascade,
  segment_id uuid references public.translation_practice_segments(id) on delete cascade,
  issue_type text not null,
  severity text not null default '中等'
    check (severity in ('轻微', '中等', '严重')),
  description text not null default '',
  suggestion text not null default '',
  is_added_to_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expression_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_item_id uuid references public.translation_practice_items(id) on delete set null,
  segment_id uuid references public.translation_practice_segments(id) on delete set null,
  source_expression text not null,
  target_expression text not null default '',
  context_sentence text not null default '',
  usage_context text not null default '',
  category text not null default '其他',
  tags text[] not null default '{}'::text[],
  note text not null default '',
  familiarity_level text not null default 'new'
    check (familiarity_level in ('new', 'learning', 'mastered')),
  next_review_at timestamptz,
  review_count integer not null default 0,
  remembered_streak integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practice_review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_type text not null check (review_type in ('expression_card', 'issue_segment', 'practice_item')),
  target_id uuid not null,
  result text not null check (result in ('forgot', 'fuzzy', 'remembered')),
  next_review_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists translation_practice_items_user_updated_idx
  on public.translation_practice_items(user_id, updated_at desc);
create index if not exists translation_practice_items_user_review_idx
  on public.translation_practice_items(user_id, next_review_at);
create index if not exists translation_practice_segments_item_order_idx
  on public.translation_practice_segments(practice_item_id, segment_order);
create index if not exists translation_practice_issues_item_type_idx
  on public.translation_practice_issues(practice_item_id, issue_type);
create index if not exists expression_cards_user_review_idx
  on public.expression_cards(user_id, next_review_at);
create index if not exists practice_review_logs_user_created_idx
  on public.practice_review_logs(user_id, created_at desc);

drop trigger if exists translation_practice_items_touch on public.translation_practice_items;
create trigger translation_practice_items_touch
  before update on public.translation_practice_items
  for each row execute function public.touch_updated_at();

drop trigger if exists translation_practice_segments_touch on public.translation_practice_segments;
create trigger translation_practice_segments_touch
  before update on public.translation_practice_segments
  for each row execute function public.touch_updated_at();

drop trigger if exists translation_practice_issues_touch on public.translation_practice_issues;
create trigger translation_practice_issues_touch
  before update on public.translation_practice_issues
  for each row execute function public.touch_updated_at();

drop trigger if exists expression_cards_touch on public.expression_cards;
create trigger expression_cards_touch
  before update on public.expression_cards
  for each row execute function public.touch_updated_at();

alter table public.translation_practice_items enable row level security;
alter table public.translation_practice_segments enable row level security;
alter table public.translation_practice_issues enable row level security;
alter table public.expression_cards enable row level security;
alter table public.practice_review_logs enable row level security;

drop policy if exists translation_practice_items_own_all on public.translation_practice_items;
create policy translation_practice_items_own_all on public.translation_practice_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists translation_practice_segments_own_all on public.translation_practice_segments;
create policy translation_practice_segments_own_all on public.translation_practice_segments
  for all using (
    exists (
      select 1 from public.translation_practice_items item
      where item.id = practice_item_id and item.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.translation_practice_items item
      where item.id = practice_item_id and item.user_id = auth.uid()
    )
  );

drop policy if exists translation_practice_issues_own_all on public.translation_practice_issues;
create policy translation_practice_issues_own_all on public.translation_practice_issues
  for all using (
    exists (
      select 1 from public.translation_practice_items item
      where item.id = practice_item_id and item.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.translation_practice_items item
      where item.id = practice_item_id and item.user_id = auth.uid()
    )
    and (
      segment_id is null
      or exists (
        select 1 from public.translation_practice_segments segment
        where segment.id = segment_id and segment.practice_item_id = practice_item_id
      )
    )
  );

drop policy if exists expression_cards_own_all on public.expression_cards;
create policy expression_cards_own_all on public.expression_cards
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (
      practice_item_id is null
      or exists (
        select 1 from public.translation_practice_items item
        where item.id = practice_item_id and item.user_id = auth.uid()
      )
    )
    and (
      segment_id is null
      or exists (
        select 1 from public.translation_practice_segments segment
        join public.translation_practice_items item on item.id = segment.practice_item_id
        where segment.id = segment_id and item.user_id = auth.uid()
      )
    )
  );

drop policy if exists practice_review_logs_own_all on public.practice_review_logs;
create policy practice_review_logs_own_all on public.practice_review_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
