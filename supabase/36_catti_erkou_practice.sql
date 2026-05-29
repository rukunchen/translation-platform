-- =====================================================================
-- 36_catti_erkou_practice.sql
-- Add CATTI erkou practice metadata, segment tables, and RLS policies.
-- =====================================================================

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'catti_mock_exams'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%exam_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.catti_mock_exams drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.catti_mock_exams
  add constraint catti_mock_exams_exam_type_check
  check (exam_type in ('erbi_practice', 'erkou_practice'));

alter table public.catti_mock_exams
  add column if not exists voice_type text default 'neutral',
  add column if not exists speech_rate text default 'standard',
  add column if not exists pause_mode text default 'auto',
  add column if not exists pause_seconds int,
  add column if not exists segment_mode text default 'auto',
  add column if not exists tts_status text default 'not_generated';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'catti_mock_exams_voice_type_check'
  ) then
    alter table public.catti_mock_exams
      add constraint catti_mock_exams_voice_type_check
      check (voice_type in ('male', 'female', 'neutral'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'catti_mock_exams_speech_rate_check'
  ) then
    alter table public.catti_mock_exams
      add constraint catti_mock_exams_speech_rate_check
      check (speech_rate in ('slow', 'standard', 'fast'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'catti_mock_exams_pause_mode_check'
  ) then
    alter table public.catti_mock_exams
      add constraint catti_mock_exams_pause_mode_check
      check (pause_mode in ('auto', 'fixed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'catti_mock_exams_pause_seconds_check'
  ) then
    alter table public.catti_mock_exams
      add constraint catti_mock_exams_pause_seconds_check
      check (pause_seconds is null or pause_seconds >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'catti_mock_exams_segment_mode_check'
  ) then
    alter table public.catti_mock_exams
      add constraint catti_mock_exams_segment_mode_check
      check (segment_mode in ('auto', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'catti_mock_exams_tts_status_check'
  ) then
    alter table public.catti_mock_exams
      add constraint catti_mock_exams_tts_status_check
      check (tts_status in ('not_generated', 'generating', 'generated', 'failed'));
  end if;
end $$;

create table if not exists public.catti_mock_segments (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.catti_mock_exams(id) on delete cascade,
  segment_order int not null,
  source_text text not null,
  reference_translation text,
  audio_url text,
  tts_voice text,
  speech_rate text,
  pause_seconds int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, segment_order)
);

create table if not exists public.catti_mock_attempt_segments (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.catti_mock_attempts(id) on delete cascade,
  segment_id uuid references public.catti_mock_segments(id) on delete set null,
  user_audio_url text,
  transcript text,
  score_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catti_mock_segments_exam_order_idx
  on public.catti_mock_segments(exam_id, segment_order);

create index if not exists catti_mock_attempt_segments_attempt_idx
  on public.catti_mock_attempt_segments(attempt_id);

create index if not exists catti_mock_attempt_segments_segment_idx
  on public.catti_mock_attempt_segments(segment_id);

drop trigger if exists catti_mock_segments_touch on public.catti_mock_segments;
create trigger catti_mock_segments_touch
  before update on public.catti_mock_segments
  for each row execute function public.touch_updated_at();

drop trigger if exists catti_mock_attempt_segments_touch on public.catti_mock_attempt_segments;
create trigger catti_mock_attempt_segments_touch
  before update on public.catti_mock_attempt_segments
  for each row execute function public.touch_updated_at();

alter table public.catti_mock_segments enable row level security;
alter table public.catti_mock_attempt_segments enable row level security;

drop policy if exists catti_mock_segments_select_published_exam on public.catti_mock_segments;
create policy catti_mock_segments_select_published_exam on public.catti_mock_segments
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.catti_mock_exams exam
      where exam.id = public.catti_mock_segments.exam_id
        and exam.status = 'published'
    )
  );

drop policy if exists catti_mock_segments_admin_all on public.catti_mock_segments;
create policy catti_mock_segments_admin_all on public.catti_mock_segments
  for all using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  ) with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
  );

drop policy if exists catti_mock_attempt_segments_own_select on public.catti_mock_attempt_segments;
create policy catti_mock_attempt_segments_own_select on public.catti_mock_attempt_segments
  for select using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
    or exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = public.catti_mock_attempt_segments.attempt_id
        and attempt.user_id = auth.uid()
    )
  );

drop policy if exists catti_mock_attempt_segments_own_insert on public.catti_mock_attempt_segments;
create policy catti_mock_attempt_segments_own_insert on public.catti_mock_attempt_segments
  for insert with check (
    exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = public.catti_mock_attempt_segments.attempt_id
        and attempt.user_id = auth.uid()
        and (
          public.catti_mock_attempt_segments.segment_id is null
          or exists (
            select 1 from public.catti_mock_segments segment
            where segment.id = public.catti_mock_attempt_segments.segment_id
              and segment.exam_id = attempt.exam_id
          )
        )
    )
  );

drop policy if exists catti_mock_attempt_segments_own_update on public.catti_mock_attempt_segments;
create policy catti_mock_attempt_segments_own_update on public.catti_mock_attempt_segments
  for update using (
    exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = public.catti_mock_attempt_segments.attempt_id
        and attempt.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.catti_mock_attempts attempt
      where attempt.id = public.catti_mock_attempt_segments.attempt_id
        and attempt.user_id = auth.uid()
        and (
          public.catti_mock_attempt_segments.segment_id is null
          or exists (
            select 1 from public.catti_mock_segments segment
            where segment.id = public.catti_mock_attempt_segments.segment_id
              and segment.exam_id = attempt.exam_id
          )
        )
    )
  );
