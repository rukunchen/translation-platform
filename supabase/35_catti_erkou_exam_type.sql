-- =====================================================================
-- 35_catti_erkou_exam_type.sql
-- Allow CATTI erkou practice exams in the shared CATTI mock exam tables.
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
    and pg_get_constraintdef(con.oid) like '%erbi_practice%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.catti_mock_exams drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.catti_mock_exams
  add constraint catti_mock_exams_exam_type_check
  check (exam_type in ('erbi_practice', 'erkou_practice'));
