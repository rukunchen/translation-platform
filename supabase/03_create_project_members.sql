-- =====================================================================
-- 03_create_project_members.sql
-- 项目成员表 + 老数据迁移
-- 角色：manager / translator / reviewer
-- =====================================================================

create table if not exists public.project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('manager','translator','reviewer')),
  added_by    uuid references public.profiles(id),
  added_at    timestamptz default now(),
  unique (project_id, user_id)
);

create index if not exists project_members_project_idx on public.project_members(project_id);
create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists project_members_role_idx on public.project_members(project_id, role);

-- 触发器：创建新项目时，自动把 created_by 写成 manager
create or replace function public.add_creator_as_manager()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, role, added_by)
    values (new.id, new.created_by, 'manager', new.created_by)
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_add_creator_as_manager on public.projects;
create trigger projects_add_creator_as_manager
  after insert on public.projects
  for each row execute function public.add_creator_as_manager();

-- 老数据迁移：把所有现有 projects.created_by 写成 manager（幂等）
insert into public.project_members (project_id, user_id, role, added_by)
select p.id, p.created_by, 'manager', p.created_by
from public.projects p
where p.created_by is not null
on conflict (project_id, user_id) do nothing;
