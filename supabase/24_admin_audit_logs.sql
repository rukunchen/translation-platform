-- =====================================================================
-- 24_admin_audit_logs.sql
-- 管理控制台审计日志：记录平台管理员的用户、项目成员等关键操作。
-- =====================================================================

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text not null,
  target_id text,
  target_label text,
  project_id uuid references public.projects(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs(created_at desc);

create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs(actor_id, created_at desc);

create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs(target_type, target_id);

create index if not exists admin_audit_logs_project_idx
  on public.admin_audit_logs(project_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists admin_audit_logs_select_platform_admins on public.admin_audit_logs;
create policy admin_audit_logs_select_platform_admins on public.admin_audit_logs
  for select using (
    exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = auth.uid()
        and pa.is_active = true
    )
  );
