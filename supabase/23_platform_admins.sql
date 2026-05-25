-- =====================================================================
-- 23_platform_admins.sql
-- 平台管理员角色表：运行时管理员身份不再依赖前端/后端硬编码邮箱。
-- =====================================================================

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'admin'
    check (role in ('owner', 'admin')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_admins_email_idx
  on public.platform_admins(lower(email));

create index if not exists platform_admins_active_idx
  on public.platform_admins(is_active);

drop trigger if exists platform_admins_touch on public.platform_admins;
create trigger platform_admins_touch
  before update on public.platform_admins
  for each row execute function public.touch_updated_at();

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self on public.platform_admins
  for select using (user_id = auth.uid());

-- Bootstrap the existing fixed administrator into the role table once.
-- After this migration, runtime authorization checks use platform_admins.user_id.
insert into public.platform_admins (user_id, email, role, is_active)
select id, email, 'owner', true
from auth.users
where lower(email) = 'rukunchen@hotmail.com'
on conflict (user_id) do update set
  email = excluded.email,
  role = case
    when public.platform_admins.role = 'owner' then public.platform_admins.role
    else excluded.role
  end,
  is_active = true,
  updated_at = now();
