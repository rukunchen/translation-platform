-- Allow the sole admin to create and update their own CATTI attempt records
-- while previewing draft exams. Regular users remain limited to published exams.

drop policy if exists catti_mock_attempts_own_insert on public.catti_mock_attempts;
create policy catti_mock_attempts_own_insert on public.catti_mock_attempts
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.catti_mock_exams exam
      where exam.id = exam_id
        and (
          exam.status = 'published'
          or lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
        )
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
      where exam.id = exam_id
        and (
          exam.status = 'published'
          or lower(coalesce(auth.jwt() ->> 'email', '')) = 'rukunchen@hotmail.com'
        )
    )
  );
