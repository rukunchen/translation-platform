-- =====================================================================
-- 34_catti_erbi_passages.sql
-- Add passage-level structure for full CATTI erbi practice mock exams.
-- =====================================================================

create table if not exists public.catti_mock_passages (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.catti_mock_exams(id) on delete cascade,
  passage_order int not null check (passage_order between 1 and 4),
  direction text not null check (direction in ('E-C', 'C-E')),
  title text,
  source_text text not null,
  reference_translation text,
  scoring_note text,
  max_score numeric not null default 25 check (max_score > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, passage_order)
);

create table if not exists public.catti_mock_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.catti_mock_attempts(id) on delete cascade,
  passage_id uuid not null references public.catti_mock_passages(id) on delete cascade,
  answer_text text,
  total_score numeric,
  score_json jsonb,
  overall_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, passage_id)
);

alter table public.catti_mock_sentence_analysis
  add column if not exists passage_id uuid references public.catti_mock_passages(id) on delete cascade;

create index if not exists catti_mock_passages_exam_order_idx
  on public.catti_mock_passages(exam_id, passage_order);

create index if not exists catti_mock_attempt_answers_attempt_idx
  on public.catti_mock_attempt_answers(attempt_id);

create index if not exists catti_mock_attempt_answers_passage_idx
  on public.catti_mock_attempt_answers(passage_id);

create index if not exists catti_mock_sentence_analysis_passage_order_idx
  on public.catti_mock_sentence_analysis(attempt_id, passage_id, sentence_order);

drop trigger if exists catti_mock_passages_touch on public.catti_mock_passages;
create trigger catti_mock_passages_touch
  before update on public.catti_mock_passages
  for each row execute function public.touch_updated_at();

drop trigger if exists catti_mock_attempt_answers_touch on public.catti_mock_attempt_answers;
create trigger catti_mock_attempt_answers_touch
  before update on public.catti_mock_attempt_answers
  for each row execute function public.touch_updated_at();

alter table public.catti_mock_passages enable row level security;
alter table public.catti_mock_attempt_answers enable row level security;

drop policy if exists catti_mock_passages_select_visible_exam on public.catti_mock_passages;
create policy catti_mock_passages_select_visible_exam on public.catti_mock_passages
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.catti_mock_exams exam
      where exam.id = public.catti_mock_passages.exam_id
        and (
          exam.status = 'published'
          or lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
        )
    )
  );

drop policy if exists catti_mock_passages_admin_all on public.catti_mock_passages;
create policy catti_mock_passages_admin_all on public.catti_mock_passages
  for all using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  ) with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists catti_mock_attempt_answers_own_select on public.catti_mock_attempt_answers;
create policy catti_mock_attempt_answers_own_select on public.catti_mock_attempt_answers
  for select using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
    or exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = public.catti_mock_attempt_answers.attempt_id
        and attempt.user_id = auth.uid()
    )
  );

drop policy if exists catti_mock_attempt_answers_own_insert on public.catti_mock_attempt_answers;
create policy catti_mock_attempt_answers_own_insert on public.catti_mock_attempt_answers
  for insert with check (
    exists (
      select 1
      from public.catti_mock_attempts attempt
      join public.catti_mock_passages passage on passage.id = public.catti_mock_attempt_answers.passage_id
      join public.catti_mock_exams exam on exam.id = passage.exam_id
      where attempt.id = public.catti_mock_attempt_answers.attempt_id
        and attempt.user_id = auth.uid()
        and attempt.status = 'in_progress'
        and attempt.exam_id = passage.exam_id
        and exam.status = 'published'
    )
  );

drop policy if exists catti_mock_attempt_answers_own_update on public.catti_mock_attempt_answers;
create policy catti_mock_attempt_answers_own_update on public.catti_mock_attempt_answers
  for update using (
    exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = public.catti_mock_attempt_answers.attempt_id
        and attempt.user_id = auth.uid()
        and attempt.status = 'in_progress'
    )
  ) with check (
    exists (
      select 1
      from public.catti_mock_attempts attempt
      join public.catti_mock_passages passage on passage.id = public.catti_mock_attempt_answers.passage_id
      join public.catti_mock_exams exam on exam.id = passage.exam_id
      where attempt.id = public.catti_mock_attempt_answers.attempt_id
        and attempt.user_id = auth.uid()
        and attempt.status = 'in_progress'
        and attempt.exam_id = passage.exam_id
        and exam.status = 'published'
    )
  );

drop policy if exists catti_mock_attempt_answers_admin_all on public.catti_mock_attempt_answers;
create policy catti_mock_attempt_answers_admin_all on public.catti_mock_attempt_answers
  for all using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  ) with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

-- Backfill a single passage for existing single-text exams so current data
-- remains readable before the UI is upgraded to four passages.
insert into public.catti_mock_passages (
  exam_id,
  passage_order,
  direction,
  title,
  source_text,
  reference_translation,
  scoring_note,
  max_score
)
select
  exam.id,
  1,
  exam.direction,
  '原文 1',
  exam.source_text,
  exam.reference_translation,
  exam.scoring_note,
  100
from public.catti_mock_exams exam
where not exists (
  select 1 from public.catti_mock_passages passage
  where passage.exam_id = exam.id
);
