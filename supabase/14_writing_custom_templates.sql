-- =====================================================================
-- 14_writing_custom_templates.sql
-- 自定义论文模板：id default 与 RLS 写入策略
-- =====================================================================

alter table public.writing_templates
  alter column id set default gen_random_uuid()::text;

drop policy if exists writing_templates_insert_custom on public.writing_templates;
create policy writing_templates_insert_custom on public.writing_templates
  for insert with check (
    is_system_template = false
    and created_by = auth.uid()
  );

drop policy if exists writing_templates_update_custom on public.writing_templates;
create policy writing_templates_update_custom on public.writing_templates
  for update using (
    is_system_template = false
    and created_by = auth.uid()
  ) with check (
    is_system_template = false
    and created_by = auth.uid()
  );

drop policy if exists writing_templates_delete_custom on public.writing_templates;
create policy writing_templates_delete_custom on public.writing_templates
  for delete using (
    is_system_template = false
    and created_by = auth.uid()
  );
