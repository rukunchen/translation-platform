-- 让"创建者 = 自动 manager 成员"成为数据库强制规则
-- 同时回填已有项目的缺失成员记录

-- 1) 触发器：新建 projects 时自动给 created_by 写一条 manager 记录
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
end $$;

drop trigger if exists trg_projects_add_creator on public.projects;
create trigger trg_projects_add_creator
  after insert on public.projects
  for each row execute function public.add_creator_as_manager();

-- 2) 回填：任何"创建者不在 project_members 中"的旧项目，补一条
insert into public.project_members (project_id, user_id, role, added_by)
select p.id, p.created_by, 'manager', p.created_by
from public.projects p
where p.created_by is not null
  and not exists (
    select 1 from public.project_members pm
    where pm.project_id = p.id and pm.user_id = p.created_by
  )
on conflict (project_id, user_id) do nothing;

-- 3) 确保 projects 表的 RLS 是开着的（幂等）
alter table public.projects enable row level security;
