-- CATTI erkou exam structure: 4 passages, 18 interpretation segments.

alter table public.catti_mock_segments
  add column if not exists passage_order int,
  add column if not exists passage_title text,
  add column if not exists direction text,
  add column if not exists segment_order_global int,
  add column if not exists segment_order_in_passage int,
  add column if not exists estimated_play_seconds int,
  add column if not exists recording_seconds int,
  add column if not exists transition_seconds int default 5;

update public.catti_mock_segments
set
  segment_order_global = coalesce(segment_order_global, segment_order),
  transition_seconds = coalesce(transition_seconds, 5)
where segment_order_global is null
   or transition_seconds is null;

create index if not exists catti_mock_segments_exam_global_order_idx
  on public.catti_mock_segments(exam_id, segment_order_global);

create index if not exists catti_mock_segments_exam_passage_order_idx
  on public.catti_mock_segments(exam_id, passage_order, segment_order_in_passage);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'catti_mock_segments_direction_check'
  ) then
    alter table public.catti_mock_segments
      add constraint catti_mock_segments_direction_check
      check (direction is null or direction in ('E-C', 'C-E'));
  end if;
end $$;
