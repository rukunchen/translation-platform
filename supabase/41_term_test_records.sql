-- =====================================================================
-- 41_term_test_records.sql
-- 词条测试：测试记录与逐题作答记录。
-- =====================================================================

create table if not exists public.term_test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null
    check (source_type in ('public_category', 'my_termbook')),
  category_id uuid references public.term_categories(id) on delete set null,
  total_questions int default 0
    check (total_questions >= 0),
  correct_count int default 0
    check (correct_count >= 0),
  accuracy numeric default 0
    check (accuracy >= 0 and accuracy <= 100),
  direction_mode text
    check (direction_mode in ('zh_to_en', 'en_to_zh', 'random')),
  created_at timestamptz default now()
);

create table if not exists public.term_test_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.term_test_attempts(id) on delete cascade,
  public_term_id uuid references public.public_terms(id) on delete set null,
  termbook_item_id uuid references public.user_termbook_items(id) on delete set null,
  question_text text,
  correct_answer text,
  selected_answer text,
  is_correct boolean,
  options jsonb default '[]'::jsonb,
  explanation text,
  created_at timestamptz default now()
);

create index if not exists term_test_attempts_user_created_idx
  on public.term_test_attempts(user_id, created_at desc);

create index if not exists term_test_attempts_category_created_idx
  on public.term_test_attempts(category_id, created_at desc)
  where category_id is not null;

create index if not exists term_test_questions_attempt_idx
  on public.term_test_questions(attempt_id, created_at);

create index if not exists term_test_questions_public_term_idx
  on public.term_test_questions(public_term_id)
  where public_term_id is not null;

create index if not exists term_test_questions_termbook_item_idx
  on public.term_test_questions(termbook_item_id)
  where termbook_item_id is not null;

alter table public.term_test_attempts enable row level security;
alter table public.term_test_questions enable row level security;

drop policy if exists term_test_attempts_own_select on public.term_test_attempts;
create policy term_test_attempts_own_select on public.term_test_attempts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists term_test_attempts_own_insert on public.term_test_attempts;
create policy term_test_attempts_own_insert on public.term_test_attempts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists term_test_questions_own_select on public.term_test_questions;
create policy term_test_questions_own_select on public.term_test_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.term_test_attempts attempt
      where attempt.id = attempt_id
        and attempt.user_id = auth.uid()
    )
  );

drop policy if exists term_test_questions_own_insert on public.term_test_questions;
create policy term_test_questions_own_insert on public.term_test_questions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.term_test_attempts attempt
      where attempt.id = attempt_id
        and attempt.user_id = auth.uid()
    )
    and (
      termbook_item_id is null
      or exists (
        select 1
        from public.user_termbook_items item
        where item.id = termbook_item_id
          and item.user_id = auth.uid()
      )
    )
  );

grant select, insert on public.term_test_attempts to authenticated;
grant select, insert on public.term_test_questions to authenticated;
