-- =====================================================================
-- 13_writing_workshop.sql
-- 论文写作工坊 MVP：个人论文项目、章节、系统模板、导出记录
-- =====================================================================

create table if not exists public.writing_templates (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  language text not null check (language in ('zh', 'en')),
  paper_type text not null,
  template_type text not null,
  description text default '',
  format_rules jsonb not null default '{}'::jsonb,
  section_structure jsonb not null default '[]'::jsonb,
  is_system_template boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.writing_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  language text not null check (language in ('zh', 'en')),
  paper_type text not null,
  template_id text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.writing_sections (
  id uuid primary key default gen_random_uuid(),
  writing_project_id uuid not null references public.writing_projects(id) on delete cascade,
  section_key text not null,
  section_title text not null,
  section_order integer not null,
  content text not null default '',
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (writing_project_id, section_order)
);

create table if not exists public.writing_exports (
  id uuid primary key default gen_random_uuid(),
  writing_project_id uuid not null references public.writing_projects(id) on delete cascade,
  export_format text not null default 'docx',
  template_id text,
  file_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists writing_projects_user_updated_idx
  on public.writing_projects(user_id, updated_at desc);

create index if not exists writing_sections_project_order_idx
  on public.writing_sections(writing_project_id, section_order);

-- ============ system templates ============
insert into public.writing_templates
  (id, name, language, paper_type, template_type, description, format_rules, section_structure, is_system_template)
values
  ('zh-course-paper', '通用中文课程论文模板', 'zh', '课程论文', 'course_paper', '适合课程论文、课堂研究报告和一般中文学术短论文。',
   '{"pageSize":"A4","margins":"上 2.5cm，下 2.5cm，左 3cm，右 2.5cm","bodyFont":"宋体","latinFont":"Times New Roman","fontSize":"12pt","lineSpacing":"1.5 倍","paragraphIndent":"2 字符","heading":"一级标题：黑体，四号，加粗；二级标题：黑体，小四，加粗","references":"GB/T 7714"}'::jsonb,
   '["题目","摘要","关键词","引言","正文","结论","参考文献"]'::jsonb, true),
  ('zh-translation-practice', '中文翻译实践报告模板', 'zh', '翻译实践报告', 'translation_practice', '适合翻译实践报告和 MTI 课程论文。',
   '{"pageSize":"A4","margins":"上 2.5cm，下 2.5cm，左 3cm，右 2.5cm","bodyFont":"宋体","latinFont":"Times New Roman","fontSize":"12pt","lineSpacing":"1.5 倍","paragraphIndent":"2 字符","heading":"一级标题：黑体，四号，加粗；二级标题：黑体，小四，加粗","references":"GB/T 7714"}'::jsonb,
   '["题目","中文摘要","关键词","English Abstract","Keywords","第一章 任务描述","第二章 过程描述","第三章 案例分析","第四章 实践总结","参考文献","附录"]'::jsonb, true),
  ('zh-proposal', '中文开题报告模板', 'zh', '开题报告', 'proposal', '覆盖研究背景、意义、现状、方法和计划。',
   '{"pageSize":"A4","margins":"上 2.5cm，下 2.5cm，左 3cm，右 2.5cm","bodyFont":"宋体","latinFont":"Times New Roman","fontSize":"12pt","lineSpacing":"1.5 倍","paragraphIndent":"2 字符","heading":"一级标题：黑体，四号，加粗；二级标题：黑体，小四，加粗","references":"GB/T 7714"}'::jsonb,
   '["题目","研究背景","研究目的与意义","国内外研究现状","研究内容","研究方法","创新点","研究计划","参考文献"]'::jsonb, true),
  ('apa-7-paper', 'APA 7th Paper', 'en', 'APA Paper', 'apa', 'Basic APA 7th paper structure for English academic writing.',
   '{"pageSize":"A4","margins":"1 inch","bodyFont":"Times New Roman","latinFont":"Times New Roman","fontSize":"12 pt","lineSpacing":"double","paragraphIndent":"0.5 inch","heading":"Headings bold","references":"APA 7 style placeholder"}'::jsonb,
   '["Title Page","Abstract","Keywords","Introduction","Literature Review","Methodology","Results","Discussion","Conclusion","References","Appendix"]'::jsonb, true),
  ('en-research-article', 'English Research Article', 'en', 'Research Article', 'research_article', 'Standard English research article structure.',
   '{"pageSize":"A4","margins":"1 inch","bodyFont":"Times New Roman","latinFont":"Times New Roman","fontSize":"12 pt","lineSpacing":"double","paragraphIndent":"0.5 inch","heading":"Headings bold","references":"APA 7 style placeholder"}'::jsonb,
   '["Title","Abstract","Keywords","Introduction","Literature Review","Methodology","Results","Discussion","Conclusion","References"]'::jsonb, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  format_rules = excluded.format_rules,
  section_structure = excluded.section_structure,
  updated_at = now();

-- ============ RLS ============
alter table public.writing_templates enable row level security;
alter table public.writing_projects enable row level security;
alter table public.writing_sections enable row level security;
alter table public.writing_exports enable row level security;

drop policy if exists writing_templates_select on public.writing_templates;
create policy writing_templates_select on public.writing_templates
  for select using (is_system_template or created_by = auth.uid());

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

drop policy if exists writing_projects_select on public.writing_projects;
create policy writing_projects_select on public.writing_projects
  for select using (user_id = auth.uid());

drop policy if exists writing_projects_insert on public.writing_projects;
create policy writing_projects_insert on public.writing_projects
  for insert with check (user_id = auth.uid());

drop policy if exists writing_projects_update on public.writing_projects;
create policy writing_projects_update on public.writing_projects
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists writing_projects_delete on public.writing_projects;
create policy writing_projects_delete on public.writing_projects
  for delete using (user_id = auth.uid());

drop policy if exists writing_sections_select on public.writing_sections;
create policy writing_sections_select on public.writing_sections
  for select using (
    exists (
      select 1 from public.writing_projects p
      where p.id = writing_sections.writing_project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists writing_sections_insert on public.writing_sections;
create policy writing_sections_insert on public.writing_sections
  for insert with check (
    exists (
      select 1 from public.writing_projects p
      where p.id = writing_sections.writing_project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists writing_sections_update on public.writing_sections;
create policy writing_sections_update on public.writing_sections
  for update using (
    exists (
      select 1 from public.writing_projects p
      where p.id = writing_sections.writing_project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists writing_sections_delete on public.writing_sections;
create policy writing_sections_delete on public.writing_sections
  for delete using (
    exists (
      select 1 from public.writing_projects p
      where p.id = writing_sections.writing_project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists writing_exports_select on public.writing_exports;
create policy writing_exports_select on public.writing_exports
  for select using (
    exists (
      select 1 from public.writing_projects p
      where p.id = writing_exports.writing_project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists writing_exports_insert on public.writing_exports;
create policy writing_exports_insert on public.writing_exports
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.writing_projects p
      where p.id = writing_exports.writing_project_id
        and p.user_id = auth.uid()
    )
  );
