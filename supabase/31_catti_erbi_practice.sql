-- =====================================================================
-- 31_catti_erbi_practice.sql
-- CATTI erbi practice mock exams, attempts, and sentence-level analysis.
-- =====================================================================

create table if not exists public.catti_mock_exams (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  exam_type text not null default 'erbi_practice'
    check (exam_type = 'erbi_practice'),
  direction text not null default 'E-C'
    check (direction in ('E-C', 'C-E')),
  difficulty text not null default '二级',
  duration_minutes int not null default 180
    check (duration_minutes > 0),
  source_text text not null,
  reference_translation text,
  scoring_note text,
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catti_mock_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.catti_mock_exams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'scored')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answer_text text,
  total_score numeric,
  score_json jsonb,
  overall_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catti_mock_sentence_analysis (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.catti_mock_attempts(id) on delete cascade,
  sentence_order int,
  source_sentence text,
  user_translation text,
  problem_type text,
  problem_detail text,
  suggestion text,
  reference_version text,
  created_at timestamptz not null default now()
);

create index if not exists catti_mock_exams_status_created_idx
  on public.catti_mock_exams(status, created_at desc);
create index if not exists catti_mock_attempts_user_created_idx
  on public.catti_mock_attempts(user_id, created_at desc);
create index if not exists catti_mock_attempts_exam_user_idx
  on public.catti_mock_attempts(exam_id, user_id);
create index if not exists catti_mock_sentence_analysis_attempt_order_idx
  on public.catti_mock_sentence_analysis(attempt_id, sentence_order);

drop trigger if exists catti_mock_exams_touch on public.catti_mock_exams;
create trigger catti_mock_exams_touch
  before update on public.catti_mock_exams
  for each row execute function public.touch_updated_at();

drop trigger if exists catti_mock_attempts_touch on public.catti_mock_attempts;
create trigger catti_mock_attempts_touch
  before update on public.catti_mock_attempts
  for each row execute function public.touch_updated_at();

alter table public.catti_mock_exams enable row level security;
alter table public.catti_mock_attempts enable row level security;
alter table public.catti_mock_sentence_analysis enable row level security;

drop policy if exists catti_mock_exams_select_published on public.catti_mock_exams;
create policy catti_mock_exams_select_published on public.catti_mock_exams
  for select using (
    auth.uid() is not null
    and status = 'published'
  );

drop policy if exists catti_mock_exams_admin_all on public.catti_mock_exams;
create policy catti_mock_exams_admin_all on public.catti_mock_exams
  for all using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  ) with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists catti_mock_attempts_own_select on public.catti_mock_attempts;
create policy catti_mock_attempts_own_select on public.catti_mock_attempts
  for select using (
    user_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists catti_mock_attempts_own_insert on public.catti_mock_attempts;
create policy catti_mock_attempts_own_insert on public.catti_mock_attempts
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.catti_mock_exams exam
      where exam.id = exam_id and exam.status = 'published'
    )
  );

drop policy if exists catti_mock_attempts_own_update on public.catti_mock_attempts;
create policy catti_mock_attempts_own_update on public.catti_mock_attempts
  for update using (
    user_id = auth.uid()
  ) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.catti_mock_exams exam
      where exam.id = exam_id and exam.status = 'published'
    )
  );

drop policy if exists catti_mock_sentence_analysis_own_select on public.catti_mock_sentence_analysis;
create policy catti_mock_sentence_analysis_own_select on public.catti_mock_sentence_analysis
  for select using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
    or exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = attempt_id and attempt.user_id = auth.uid()
    )
  );

drop policy if exists catti_mock_sentence_analysis_own_insert on public.catti_mock_sentence_analysis;
create policy catti_mock_sentence_analysis_own_insert on public.catti_mock_sentence_analysis
  for insert with check (
    exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = attempt_id and attempt.user_id = auth.uid()
    )
  );

drop policy if exists catti_mock_sentence_analysis_own_update on public.catti_mock_sentence_analysis;
create policy catti_mock_sentence_analysis_own_update on public.catti_mock_sentence_analysis
  for update using (
    exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = attempt_id and attempt.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = attempt_id and attempt.user_id = auth.uid()
    )
  );

insert into public.catti_mock_exams (
  title,
  exam_type,
  direction,
  difficulty,
  duration_minutes,
  source_text,
  reference_translation,
  scoring_note,
  status
) select
  'CATTI Erbi Practice Mock 01',
  'erbi_practice',
  'E-C',
  '二级',
  180,
  'In recent years, mid-sized economies have faced a difficult policy balance. On the one hand, they need to attract investment in advanced manufacturing, digital infrastructure, and clean energy in order to sustain long-term growth. On the other hand, households and small firms remain sensitive to higher financing costs, rising rents, and uncertainty in global demand. A practical response is not to choose between stability and reform, but to improve the quality of public investment and make private participation more predictable. Governments can publish clearer project pipelines, simplify approval procedures, and use limited fiscal resources to support training, logistics, and technology adoption. Such measures may not produce immediate headline growth, but they can strengthen productivity, widen employment opportunities, and reduce the risk that short-term stimulus becomes long-term debt pressure.',
  null,
  'Original, non-CATTI copyrighted practice text. Score for accuracy, completeness, terminology, logic, style, and target-language fluency.',
  'published'
where not exists (
  select 1 from public.catti_mock_exams
  where title = 'CATTI Erbi Practice Mock 01'
);
