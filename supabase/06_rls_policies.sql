-- =====================================================================
-- 06_rls_policies.sql
-- 全套 Row Level Security 策略
-- 核心规则：
--   · 项目相关数据（documents/segments/glossary_terms/chat_messages）
--     只能被该项目的成员 (project_members) 访问
--   · 管理操作（成员管理、邀请、删项目）只允许 manager
--   · 锁定/审校的句段不可再编辑
-- =====================================================================

-- ============ 辅助函数 ============

-- 当前用户是否是某项目的成员
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

-- 当前用户在某项目中的角色（找不到返回 null）
create or replace function public.my_role(p_project_id uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select role from public.project_members
  where project_id = p_project_id and user_id = auth.uid()
  limit 1;
$$;

-- 当前用户是否是某项目的 manager
create or replace function public.is_project_manager(p_project_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.my_role(p_project_id) = 'manager';
$$;

-- ============ profiles ============
alter table public.profiles enable row level security;

-- 当前用户只能读取自己，或读取与自己同项目的成员资料。
-- 使用 security definer 避免 profiles policy 与 project_members policy 互相递归。
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select
    p_profile_id = auth.uid()
    or exists (
      select 1
      from public.project_members viewer
      join public.project_members target
        on target.project_id = viewer.project_id
      where viewer.user_id = auth.uid()
        and target.user_id = p_profile_id
    );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (public.can_view_profile(id));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ============ projects ============
alter table public.projects enable row level security;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (public.is_project_member(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (created_by = auth.uid());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (public.is_project_manager(id))
  with check (public.is_project_manager(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (public.is_project_manager(id));

-- ============ project_members ============
alter table public.project_members enable row level security;

-- 项目成员之间可见
drop policy if exists pm_select on public.project_members;
create policy pm_select on public.project_members
  for select using (public.is_project_member(project_id));

-- 只有 manager 能加成员；但建项目时也需要给创建者本人写一条 manager 记录
-- 这里允许 user_id = auth.uid() 自插（用于首次建项目时插自己的 manager 记录）
-- 或 manager 操作
drop policy if exists pm_insert on public.project_members;
create policy pm_insert on public.project_members
  for insert with check (
    public.is_project_manager(project_id)
    or (user_id = auth.uid() and role = 'manager')
  );

drop policy if exists pm_update on public.project_members;
create policy pm_update on public.project_members
  for update using (public.is_project_manager(project_id))
  with check (public.is_project_manager(project_id));

drop policy if exists pm_delete on public.project_members;
create policy pm_delete on public.project_members
  for delete using (
    public.is_project_manager(project_id)
    or user_id = auth.uid()  -- 允许成员退出自己（除最后一个 manager，由应用层校验）
  );

-- ============ documents ============
alter table public.documents enable row level security;

drop policy if exists docs_select on public.documents;
create policy docs_select on public.documents
  for select using (public.is_project_member(project_id));

drop policy if exists docs_insert on public.documents;
create policy docs_insert on public.documents
  for insert with check (public.is_project_member(project_id));

drop policy if exists docs_update on public.documents;
create policy docs_update on public.documents
  for update using (public.is_project_member(project_id));

drop policy if exists docs_delete on public.documents;
create policy docs_delete on public.documents
  for delete using (public.is_project_manager(project_id));

-- ============ segments ============
alter table public.segments enable row level security;

-- 通过 document → project 间接判断
drop policy if exists segs_select on public.segments;
create policy segs_select on public.segments
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = segments.document_id
        and public.is_project_member(d.project_id)
    )
  );

drop policy if exists segs_insert on public.segments;
create policy segs_insert on public.segments
  for insert with check (
    exists (
      select 1 from public.documents d
      where d.id = segments.document_id
        and public.is_project_member(d.project_id)
    )
  );

-- 更新规则：成员可以更新；但 status='locked' 时除 manager 外不可改
drop policy if exists segs_update on public.segments;
create policy segs_update on public.segments
  for update using (
    exists (
      select 1 from public.documents d
      where d.id = segments.document_id
        and public.is_project_member(d.project_id)
    )
    and (
      status <> 'locked'
      or public.is_project_manager(
        (select project_id from public.documents where id = segments.document_id)
      )
    )
  );

drop policy if exists segs_delete on public.segments;
create policy segs_delete on public.segments
  for delete using (
    exists (
      select 1 from public.documents d
      where d.id = segments.document_id
        and public.is_project_manager(d.project_id)
    )
  );

-- ============ glossary_terms ============
alter table public.glossary_terms enable row level security;

drop policy if exists gloss_select on public.glossary_terms;
create policy gloss_select on public.glossary_terms
  for select using (public.is_project_member(project_id));

drop policy if exists gloss_insert on public.glossary_terms;
create policy gloss_insert on public.glossary_terms
  for insert with check (public.is_project_member(project_id));

drop policy if exists gloss_update on public.glossary_terms;
create policy gloss_update on public.glossary_terms
  for update using (public.is_project_member(project_id));

drop policy if exists gloss_delete on public.glossary_terms;
create policy gloss_delete on public.glossary_terms
  for delete using (public.is_project_member(project_id));

-- ============ invitations ============
alter table public.invitations enable row level security;

-- 项目成员可看本项目的邀请记录
drop policy if exists inv_select on public.invitations;
create policy inv_select on public.invitations
  for select using (
    public.is_project_member(project_id)
    or invitee_email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists inv_insert on public.invitations;
create policy inv_insert on public.invitations
  for insert with check (public.is_project_manager(project_id));

drop policy if exists inv_update on public.invitations;
create policy inv_update on public.invitations
  for update using (
    public.is_project_manager(project_id)
    or invitee_email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists inv_delete on public.invitations;
create policy inv_delete on public.invitations
  for delete using (public.is_project_manager(project_id));

-- ============ chat_messages ============
alter table public.chat_messages enable row level security;

drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages
  for select using (public.is_project_member(project_id));

drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages
  for insert with check (
    public.is_project_member(project_id)
    and user_id = auth.uid()
  );

-- 不允许 update / delete（前面边界问题 #7：不可编辑、不可撤回）
